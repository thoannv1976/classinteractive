import { BookOpen, Check, Copy, Lightbulb, MessageCircleQuestion, MessagesSquare, Printer, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { InsightItem, PostDoc, TeachingInsightsDoc } from '@classinteract/shared';
import { AiJobButton } from '@/components/classroom/AiJobs';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { tk } from '@/i18n';
import { useApi } from '@/lib/query';
import { cn, formatDateTime } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';

export type InsightCategory = InsightItem['category'];

/** Display order, label and icon of every insight category. */
export const INSIGHT_CATEGORIES: { key: InsightCategory; label: string; icon: ReactNode; tone: string }[] = [
  { key: 'topic_questions', label: tk('Chủ đề có nhiều câu hỏi'), icon: <MessagesSquare className="h-4 w-4" />, tone: 'bg-primary-soft text-primary' },
  { key: 'misconception', label: tk('Khái niệm dễ nhầm lẫn'), icon: <TriangleAlert className="h-4 w-4" />, tone: 'bg-warning-soft text-warning' },
  { key: 'unanswered', label: tk('Câu hỏi chưa được trả lời'), icon: <MessageCircleQuestion className="h-4 w-4" />, tone: 'bg-accent-soft text-accent' },
  { key: 'needs_explanation', label: tk('Cần giảng giải bổ sung'), icon: <BookOpen className="h-4 w-4" />, tone: 'bg-danger-soft text-danger' },
  { key: 'participation', label: tk('Mức độ tham gia'), icon: <Users className="h-4 w-4" />, tone: 'bg-secondary-soft text-secondary' },
  { key: 'suggestion', label: tk('Gợi ý giảng dạy'), icon: <Lightbulb className="h-4 w-4" />, tone: 'bg-violet-50 text-violet-700' },
];

export const INSIGHTS_NOTICE = tk('AI chỉ đưa ra nhận định dựa trên dữ liệu quan sát được; không đánh giá năng lực hay động cơ của sinh viên. Giảng viên là người quyết định.');

export interface InsightsResponse {
  insights: TeachingInsightsDoc | null;
}

/** Question posts of the class keyed by post id (used to turn insight refs into links). */
export function useQuestionMap(classId: string, enabled: boolean) {
  const { data } = useApi<{ items: PostDoc[] }>(enabled ? `/classes/${classId}/questions?status=all` : null);
  return new Map((data?.items ?? []).map((p) => [p.postId, p]));
}

function RefChips({ refs, posts, classId, print }: { refs: string[]; posts: Map<string, PostDoc>; classId: string; print?: boolean }) {
  const { t } = useTranslation();
  if (!refs.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('Bài đăng liên quan')}</p>
      <ul className="flex flex-wrap gap-1.5">
        {refs.map((id) => {
          const p = posts.get(id);
          const label = p ? (p.content.length > 90 ? `${p.content.slice(0, 90)}…` : p.content) : `#${id.slice(0, 8)}`;
          return (
            <li key={id} className="max-w-full">
              {p && !print ? (
                <Link
                  to={`/teach/classes/${classId}/sessions/${p.sessionId}/posts/${p.postId}`}
                  className="inline-block max-w-full truncate rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-primary hover:border-primary"
                  title={p.content}
                >
                  “{label}”
                </Link>
              ) : (
                <span className={cn('inline-block max-w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs', p ? 'text-fg' : 'text-muted', !print && 'truncate')}>
                  {p ? `“${label}”` : label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Insight cards grouped by category (shared by the page and the printable report). */
export function InsightGroups({ doc, posts, classId, print }: { doc: TeachingInsightsDoc; posts: Map<string, PostDoc>; classId: string; print?: boolean }) {
  const { t } = useTranslation();
  const groups = INSIGHT_CATEGORIES.map((c) => ({ ...c, items: doc.insights.filter((i) => i.category === c.key) })).filter((g) => g.items.length);
  const known = new Set(INSIGHT_CATEGORIES.map((c) => c.key));
  const other = doc.insights.filter((i) => !known.has(i.category));
  if (other.length) groups.push({ key: 'suggestion', label: tk('Khác'), icon: <Lightbulb className="h-4 w-4" />, tone: 'bg-slate-100 text-slate-600', items: other });
  if (!groups.length) return <EmptyState title={t('AI không đưa ra nhận định nào')} />;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label} className="break-inside-avoid-page">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className={cn('rounded-lg p-1.5', g.tone)}>{g.icon}</span>
            {t(g.label)}
            <span className="font-normal text-muted">({g.items.length})</span>
          </h3>
          <div className={cn('grid gap-3', !print && 'lg:grid-cols-2')}>
            {g.items.map((it, i) => (
              <article key={i} className="break-inside-avoid rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] print:shadow-none">
                <h4 className="font-semibold">{it.title}</h4>
                {it.detail && <p className="mt-1 whitespace-pre-line text-sm text-fg/90">{it.detail}</p>}
                {it.evidence.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('Căn cứ')}</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                      {it.evidence.map((e, k) => (
                        <li key={k}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <RefChips refs={it.refs} posts={posts} classId={classId} print={print} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success(t('Đã sao chép'));
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error(t('Không sao chép được'));
    }
  };
  return (
    <Button size={label ? 'sm' : 'icon-sm'} variant="ghost" onClick={copy} aria-label={label ?? t('Sao chép')} title={t('Sao chép')} className="shrink-0 print:hidden">
      {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function FollowUpList({ questions, print }: { questions: string[]; print?: boolean }) {
  const { t } = useTranslation();
  if (!questions.length) return <p className="text-sm text-muted">{t('Không có câu hỏi tiếp nối.')}</p>;
  return (
    <ol className="space-y-2">
      {questions.map((q, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 break-inside-avoid">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
          <p className="flex-1 text-sm">{q}</p>
          {!print && <CopyButton text={q} />}
        </li>
      ))}
    </ol>
  );
}

export function InsightsPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const { data, isLoading, error, refetch } = useApi<InsightsResponse>(`/classes/${cls.classId}/insights`);
  const doc = data?.insights ?? null;
  const hasRefs = !!doc?.insights.some((i) => i.refs.length);
  const posts = useQuestionMap(cls.classId, hasRefs);
  const aiOff = !cls.settings.aiEnabled;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t('Gợi ý giảng dạy')}
          description={t('AI phân tích câu hỏi, chủ đề, kết quả hoạt động và mức độ tham gia của cả lớp để gợi ý điều chỉnh giảng dạy.')}
          actions={
            <>
              {doc && (
                <Button variant="outline" size="sm" onClick={() => window.open(`/print/${cls.classId}/insights`, '_blank')}>
                  <Printer className="h-4 w-4" /> {t('In / Lưu PDF')}
                </Button>
              )}
              <AiJobButton
                classId={cls.classId}
                type="teaching_insights"
                sessionId={null}
                label={doc ? t('Phân tích lại') : t('Phân tích bằng AI')}
                onDone={() => void refetch()}
                disabled={aiOff}
                size="sm"
                variant="primary"
              />
            </>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t(INSIGHTS_NOTICE)}</p>
          </div>
          {aiOff && <Alert tone="warning">{t('Lớp này chưa bật chức năng AI. Bật trong Cài đặt lớp để sử dụng.')}</Alert>}
          {doc && (
            <p className="text-xs text-muted">
              {t('Phân tích lúc {{time}}', { time: formatDateTime(doc.generatedAt) })} · {t('{{n}} nhận định', { n: doc.insights.length })}
            </p>
          )}
        </CardBody>
      </Card>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !doc ? (
        <Card>
          <EmptyState
            icon={<Lightbulb className="h-6 w-6" />}
            title={t('Chưa có gợi ý giảng dạy')}
            description={t('Nhấn “Phân tích bằng AI” để tạo nhận định từ dữ liệu tương tác của lớp. Kết quả nên được tạo sau khi đã có vài buổi học.')}
          />
        </Card>
      ) : (
        <>
          <InsightGroups doc={doc} posts={posts} classId={cls.classId} />
          <Card>
            <CardHeader
              title={t('Câu hỏi tiếp nối')}
              description={t('Có thể dùng để mở đầu hoặc kiểm tra mức độ hiểu ở buổi sau.')}
              actions={doc.followUpQuestions.length > 1 ? <CopyButton text={doc.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')} label={t('Sao chép tất cả')} /> : undefined}
            />
            <CardBody>
              <FollowUpList questions={doc.followUpQuestions} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
