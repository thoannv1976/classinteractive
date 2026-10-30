import { BookOpenCheck, Check, ChevronDown, ChevronUp, Eye, EyeOff, FileText, Plus, Save, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { doc as docRef, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { SessionSummaryDoc, SessionSummarySections, SummaryItem } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/firestore';
import { timeAgo } from '@/lib/utils';
import { tk } from '@/i18n';
import { AiJobButton } from './AiJobs';
import { sessionPath } from './hooks';

type ListKey = Exclude<keyof SessionSummarySections, 'mainContent'>;

const MAIN_TITLE = tk('Nội dung học tập chính');
/** List sections of a session summary, in display order. */
export const SUMMARY_SECTIONS: { key: ListKey; title: string }[] = [
  { key: 'topicsDiscussed', title: tk('Các chủ đề được thảo luận') },
  { key: 'keyQuestions', title: tk('Những câu hỏi quan trọng') },
  { key: 'confirmedAnswers', title: tk('Các câu trả lời đã được xác nhận') },
  { key: 'unresolved', title: tk('Các vấn đề chưa được giải đáp') },
  { key: 'difficulties', title: tk('Những nội dung sinh viên gặp khó khăn') },
  { key: 'popular', title: tk('Những nội dung được nhiều sinh viên quan tâm') },
  { key: 'nextSession', title: tk('Gợi ý cho buổi học tiếp theo') },
];
const MAX_ITEMS = 30;

const summaryDocPath = (classId: string, sessionId: string) => `${sessionPath(classId, sessionId)}/summary/current`;

/** Trims text and drops empty items (the API requires non-empty item text). */
function cleanSections(s: SessionSummarySections): SessionSummarySections {
  const out = { mainContent: s.mainContent.trim() } as SessionSummarySections;
  for (const { key } of SUMMARY_SECTIONS) out[key] = s[key].map((i) => ({ text: i.text.trim(), refs: i.refs })).filter((i) => i.text);
  return out;
}

/** Small read-only chips linking to the posts a statement is based on. */
function RefChips({ refs, to }: { refs: string[]; to: (postId: string) => string }) {
  const { t } = useTranslation();
  if (!refs.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {refs.map((r, i) => (
        <Link
          key={r}
          to={to(r)}
          title={t('Xem bài đăng nguồn')}
          aria-label={t('Bài đăng nguồn {{n}}', { n: i + 1 })}
          className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-primary-soft hover:text-primary"
        >
          <FileText className="h-3 w-3" />
          {i + 1}
        </Link>
      ))}
    </span>
  );
}

/** Lecturer / TA: generate, edit, approve and publish the AI session summary. */
export function SessionSummaryEditor({ classId, sessionId }: { classId: string; sessionId: string }) {
  const { t } = useTranslation();
  const live = useLiveDoc<SessionSummaryDoc>(summaryDocPath(classId, sessionId));
  const [draft, setDraft] = useState<SessionSummarySections | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const doc = live.data;
  const postLink = (postId: string) => `/teach/classes/${classId}/sessions/${sessionId}/posts/${postId}`;

  const generate = (
    <AiJobButton
      classId={classId}
      type="summarize_session"
      sessionId={sessionId}
      label={doc ? t('Tạo lại') : t('Tạo tóm tắt bằng AI')}
      variant={doc ? 'outline' : 'primary'}
      size={doc ? 'sm' : 'md'}
      onDone={() => setDraft(null)}
    />
  );

  if (live.loading) return <ListSkeleton rows={3} />;
  if (live.error) return <ErrorState error={live.error} />;
  if (!doc)
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title={t('Chưa có bản tóm tắt buổi học')}
        description={t('AI tổng hợp hỏi đáp, hoạt động và phiếu cuối buổi thành một bản nháp. Bạn kiểm tra, chỉnh sửa và duyệt trước khi công bố cho sinh viên.')}
        action={generate}
      />
    );

  const sections = draft ?? doc.sections;
  const dirty = draft !== null;
  const edit = (fn: (s: SessionSummarySections) => SessionSummarySections) => setDraft((prev) => fn(prev ?? doc.sections));
  const setItems = (key: ListKey, fn: (items: SummaryItem[]) => SummaryItem[]) => edit((s) => ({ ...s, [key]: fn(s[key]) }));

  const put = async (what: string, body: Record<string, unknown>, msg: string) => {
    setBusy(what);
    try {
      await api.put(`/classes/${classId}/sessions/${sessionId}/summary`, body);
      toast.success(msg);
      if (body.sections) setDraft(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () => put('save', { sections: cleanSections(sections) }, t('Đã lưu bản tóm tắt'));
  const approve = () =>
    put('approve', dirty ? { sections: cleanSections(sections), status: 'approved' } : { status: 'approved' }, t('Đã duyệt bản tóm tắt'));
  const togglePublish = () =>
    put('publish', { published: !doc.published }, doc.published ? t('Đã ngừng công bố bản tóm tắt') : t('Đã công bố bản tóm tắt cho sinh viên'));

  const approved = doc.status === 'approved';
  return (
    <Card>
      <CardHeader
        title={t('Tóm tắt buổi học')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={approved ? 'success' : 'neutral'}>{approved ? t('Đã duyệt') : t('Bản nháp')}</Badge>
            <Badge tone={doc.published ? 'primary' : 'neutral'}>
              {doc.published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {doc.published ? t('Đã công bố cho sinh viên') : t('Chưa công bố')}
            </Badge>
            {dirty && <Badge tone="warning">{t('Có thay đổi chưa lưu')}</Badge>}
            {doc.generatedAt && <span className="text-xs">{t('AI tạo {{time}}', { time: timeAgo(doc.generatedAt) })}</span>}
            {doc.editedBy && <span className="text-xs">· {t('đã chỉnh sửa')}</span>}
          </span>
        }
        actions={generate}
      />
      <CardBody className="space-y-6">
        <Alert tone="info">{t('Bản nháp do AI tạo. Hãy kiểm tra, chỉnh sửa trước khi công bố cho sinh viên.')}</Alert>
        {approved && (
          <Alert tone="warning">
            {doc.published
              ? t('Bản tóm tắt đang được công bố. Lưu chỉnh sửa sẽ đưa bản tóm tắt về Bản nháp và ngừng công bố; bạn cần duyệt và công bố lại.')
              : t('Lưu chỉnh sửa sẽ đưa bản tóm tắt về Bản nháp; bạn cần duyệt lại.')}
          </Alert>
        )}

        <section className="space-y-2">
          <label htmlFor="summary-main" className="text-sm font-semibold">
            {t(MAIN_TITLE)}
          </label>
          <Textarea id="summary-main" value={sections.mainContent} maxLength={4000} rows={5} onChange={(e) => edit((s) => ({ ...s, mainContent: e.target.value }))} />
        </section>

        {SUMMARY_SECTIONS.map(({ key, title }) => {
          const items = sections[key];
          return (
            <section key={key} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t(title)} <span className="font-normal text-muted">({items.length})</span>
              </h3>
              {items.length === 0 && <p className="text-xs text-muted">{t('Chưa có mục nào')}</p>}
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Textarea
                        value={it.text}
                        rows={2}
                        maxLength={1500}
                        className="min-h-[60px]"
                        aria-label={`${t(title)} ${i + 1}`}
                        onChange={(e) => setItems(key, (arr) => arr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      />
                      <RefChips refs={it.refs} to={postLink} />
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={t('Xóa mục')} onClick={() => setItems(key, (arr) => arr.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {items.length < MAX_ITEMS && (
                <Button variant="outline" size="sm" onClick={() => setItems(key, (arr) => [...arr, { text: '', refs: [] }])}>
                  <Plus className="h-4 w-4" /> {t('Thêm mục')}
                </Button>
              )}
            </section>
          );
        })}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3 sm:-mx-5 sm:px-5">
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={!!busy}>
              <Undo2 className="h-4 w-4" /> {t('Hủy thay đổi')}
            </Button>
          )}
          <Button variant="outline" onClick={save} disabled={!dirty || (!!busy && busy !== 'save')} loading={busy === 'save'}>
            <Save className="h-4 w-4" /> {t('Lưu')}
          </Button>
          {(!approved || dirty) && (
            <Button variant="secondary" onClick={approve} disabled={!!busy && busy !== 'approve'} loading={busy === 'approve'}>
              <Check className="h-4 w-4" /> {dirty ? t('Lưu và duyệt') : t('Duyệt')}
            </Button>
          )}
          <Button
            variant={doc.published ? 'danger-outline' : 'primary'}
            onClick={togglePublish}
            disabled={(!doc.published && (!approved || dirty)) || (!!busy && busy !== 'publish')}
            loading={busy === 'publish'}
            title={!doc.published && (!approved || dirty) ? t('Hãy duyệt bản tóm tắt trước khi công bố') : undefined}
          >
            {doc.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {doc.published ? t('Ngừng công bố') : t('Công bố cho sinh viên')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Students may only read the summary once it is published, so the listener fails before that
 * (and after it is unpublished). Keep retrying quietly so a summary published later still shows up.
 */
function usePublishedSummaryDoc(path: string) {
  const [data, setData] = useState<SessionSummaryDoc | null>(null);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const listen = () => {
      unsub = onSnapshot(
        docRef(db, path),
        (snap) => setData(snap.exists() ? (snap.data() as SessionSummaryDoc) : null),
        () => {
          setData(null);
          if (!stopped) timer = setTimeout(listen, 60_000);
        },
      );
    };
    listen();
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [path]);
  return data;
}

/** Student view: the summary once the lecturer approved and published it (renders nothing otherwise). */
export function PublishedSummary({ classId, sessionId }: { classId: string; sessionId: string }) {
  const { t } = useTranslation();
  const doc = usePublishedSummaryDoc(summaryDocPath(classId, sessionId));
  const [expanded, setExpanded] = useState(false);
  if (!doc || !doc.published) return null;
  const s = doc.sections;
  const postLink = (postId: string) => `/classes/${classId}/sessions/${sessionId}/posts/${postId}`;
  const filled = SUMMARY_SECTIONS.filter(({ key }) => s[key]?.length);

  return (
    <Card className="border-secondary/30">
      <CardBody className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <BookOpenCheck className="h-5 w-5 text-secondary" /> {t('Tóm tắt buổi học (giảng viên đã duyệt)')}
        </h2>
        {s.mainContent && (
          <section>
            <h3 className="mb-1 text-sm font-semibold">{t(MAIN_TITLE)}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{s.mainContent}</p>
          </section>
        )}
        {(expanded || !s.mainContent) &&
          filled.map(({ key, title }) => (
            <section key={key}>
              <h3 className="mb-1 text-sm font-semibold">{t(title)}</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {s[key].map((it, i) => (
                  <li key={i}>
                    <span className="whitespace-pre-wrap">{it.text}</span> <RefChips refs={it.refs} to={postLink} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {s.mainContent && filled.length > 0 && (
          <Button variant="link" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? t('Thu gọn') : t('Xem đầy đủ')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
