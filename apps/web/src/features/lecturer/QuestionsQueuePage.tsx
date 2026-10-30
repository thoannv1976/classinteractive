import { ChevronUp, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PostDoc, SessionDoc } from '@classinteract/shared';
import { AiDraftDialog } from '@/components/classroom/AiDraftDialog';
import { StatusBadge } from '@/components/classroom/PostCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { useApi } from '@/lib/query';
import { timeAgo } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';

/** Unanswered question queue across all sessions, highest votes first. */
export function QuestionsQueuePage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${cls.classId}/sessions`);
  const { data, isLoading, error, refetch } = useApi<{ items: PostDoc[] }>(`/classes/${cls.classId}/questions?status=${status}`);
  const [ai, setAi] = useState<PostDoc | null>(null);
  const sessionNo = new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s.sessionNumber]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('Câu hỏi chưa được giải đáp, ưu tiên theo số bình chọn của sinh viên.')}</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'open' | 'all')} className="w-auto" aria-label={t('Lọc')}>
          <option value="open">{t('Chưa giải đáp')}</option>
          <option value="all">{t('Tất cả câu hỏi')}</option>
        </Select>
      </div>
      <Card>
        {isLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title={t('Không còn câu hỏi chờ xử lý')} description={t('Tất cả câu hỏi đã được trả lời hoặc giải quyết.')} />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((p) => (
              <li key={p.postId} className="flex gap-3 px-4 py-3 sm:px-5">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-primary-soft py-1 text-primary">
                  <ChevronUp className="h-4 w-4" />
                  <span className="text-sm font-semibold tabular-nums">{p.voteCount}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <StatusBadge status={p.status} />
                    <span>{t('Buổi {{n}}', { n: sessionNo.get(p.sessionId) ?? '?' })}</span>
                    <span>· {p.authorName}</span>
                    <span>· {timeAgo(p.createdAt)}</span>
                    {p.topics.map((topic) => <span key={topic} className="text-secondary">#{topic}</span>)}
                  </div>
                  <Link to={`/teach/classes/${cls.classId}/sessions/${p.sessionId}/posts/${p.postId}`} className="mt-1 block text-sm hover:text-primary">
                    {p.content}
                  </Link>
                  <div className="mt-2 flex gap-2">
                    <Link to={`/teach/classes/${cls.classId}/sessions/${p.sessionId}/posts/${p.postId}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium hover:bg-slate-50">
                      <MessageSquare className="h-4 w-4" /> {t('Trả lời ({{count}})', { count: p.replyCount })}
                    </Link>
                    {cls.settings.aiEnabled && (
                      <Button size="sm" variant="soft" onClick={() => setAi(p)}>{t('AI đề xuất trả lời')}</Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <AiDraftDialog
        open={!!ai}
        onOpenChange={(v) => {
          if (!v) {
            setAi(null);
            void refetch();
          }
        }}
        classId={cls.classId}
        sessionId={ai?.sessionId ?? ''}
        post={ai}
      />
    </div>
  );
}
