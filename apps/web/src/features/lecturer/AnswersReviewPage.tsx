import { CheckCircle2, CheckCheck, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PostDoc, SessionDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { formatDateTime } from '@/lib/utils';
import { sessionLabel } from '../common/SessionStatus';
import { useClassCtx } from './ClassLayout';

type PendingAnswer = PostDoc & { question: { postId: string; content: string; authorName: string } ; helpfulScore: number };

/**
 * Students' answers waiting for the lecturer's confirmation. Confirming is what fills the
 * "answers confirmed by the lecturer" part of the participation score, so this page lets the
 * lecturer go through them quickly, one by one or in bulk. Answers classmates found helpful first.
 */
export function AnswersReviewPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const [sessionId, setSessionId] = useState('');
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${cls.classId}/sessions`);
  const path = `/classes/${cls.classId}/answers/pending${sessionId ? `?sessionId=${sessionId}` : ''}`;
  const { data, isLoading, error, refetch } = useApi<{ items: PendingAnswer[] }>(path);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => data?.items ?? [], [data]);
  const sessionById = useMemo(() => new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s])), [sessions.data]);

  const confirm = async (list: PendingAnswer[]) => {
    setBusy(true);
    let ok = 0;
    try {
      for (const p of list) {
        try {
          await api.patch(`/classes/${cls.classId}/sessions/${p.sessionId}/posts/${p.postId}/moderation`, { isAccepted: true });
          ok += 1;
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }
      if (ok) toast.success(t('Đã xác nhận {{n}} câu trả lời', { n: ok }));
      setSelected(new Set());
      await invalidate(`/classes/${cls.classId}/answers`, `/classes/${cls.classId}/scores`);
      void refetch();
    } finally {
      setBusy(false);
    }
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.postId));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {t('Mỗi câu trả lời được xác nhận giúp tác giả có điểm phần "Câu trả lời được giảng viên xác nhận" và đánh dấu câu hỏi là đã được trả lời. Câu trả lời được các bạn bấm "Hữu ích" nhiều được xếp lên đầu.')}
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="ans-session" className="text-sm text-muted">{t('Buổi học')}</label>
            <Select id="ans-session" value={sessionId} onChange={(e) => { setSessionId(e.target.value); setSelected(new Set()); }} className="w-72">
              <option value="">{t('Tất cả các buổi')}</option>
              {[...(sessions.data?.items ?? [])].sort((a, b) => b.sessionNumber - a.sessionNumber).map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{sessionLabel(s)}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.postId)))} />
                {t('Chọn tất cả ({{n}})', { n: items.length })}
              </label>
            )}
            <Button onClick={() => void confirm(items.filter((i) => selected.has(i.postId)))} disabled={!selected.size} loading={busy}>
              <CheckCheck className="h-4 w-4" /> {t('Xác nhận đã chọn ({{n}})', { n: selected.size })}
            </Button>
          </div>
        </CardBody>
      </Card>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !items.length ? (
        <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t('Không còn câu trả lời nào chờ xác nhận')} />
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const s = sessionById.get(p.sessionId);
            return (
              <li key={p.postId}>
                <Card className={selected.has(p.postId) ? 'border-primary' : undefined}>
                  <CardBody className="space-y-2">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1" aria-label={t('Chọn câu trả lời của {{name}}', { name: p.authorName })} checked={selected.has(p.postId)} onChange={() => toggle(p.postId)} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="flex items-start gap-1.5 text-sm text-muted">
                          <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="line-clamp-2">
                            <span className="font-medium">{p.question.authorName}:</span> {p.question.content}
                          </span>
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{p.content}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-medium text-fg">{p.authorName}</span>
                          <span>·</span>
                          <span>{formatDateTime(p.createdAt)}</span>
                          {s && (
                            <>
                              <span>·</span>
                              <Link to={`/teach/classes/${cls.classId}/sessions/${p.sessionId}`} className="text-primary hover:underline">{sessionLabel(s)}</Link>
                            </>
                          )}
                          {(p.reactionCounts?.helpful ?? 0) > 0 && <Badge tone="success">💡 {t('{{n}} bạn thấy hữu ích', { n: p.reactionCounts.helpful })}</Badge>}
                        </p>
                      </div>
                      <Button size="sm" variant="soft" onClick={() => void confirm([p])} disabled={busy}>
                        <CheckCircle2 className="h-4 w-4" /> {t('Xác nhận')}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
