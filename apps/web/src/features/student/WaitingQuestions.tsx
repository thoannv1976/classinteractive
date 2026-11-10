import { ChevronRight, HandHelping, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Time } from '@classinteract/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useApi } from '@/lib/query';
import { timeAgo } from '@/lib/utils';

interface WaitingQuestion {
  postId: string;
  sessionId: string;
  sessionNumber: number;
  sessionTitle: string;
  content: string;
  authorName: string;
  voteCount: number;
  createdAt: Time;
}

/**
 * Open questions classmates are still waiting on, in sessions that still accept answers.
 * Answering them is good revision and counts towards the "answers/discussion" part of the score.
 */
export function WaitingQuestions({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const { data } = useApi<{ items: WaitingQuestion[] }>(`/classes/${classId}/questions/waiting`, { refetchInterval: 60_000, retry: false });
  const items = data?.items ?? [];
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <HandHelping className="h-4 w-4 text-secondary" /> {t('Câu hỏi đang chờ bạn trả lời')}
          </span>
        }
        description={t('Trả lời câu hỏi của bạn khác là cách ôn bài tốt và được tính vào phần "Trả lời/thảo luận" của điểm tham gia.')}
      />
      <CardBody className="p-0 sm:p-0">
        <ul className="divide-y divide-border">
          {items.slice(0, 5).map((q) => (
            <li key={q.postId}>
              <Link to={`/classes/${classId}/sessions/${q.sessionId}/posts/${q.postId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{q.content}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{t('Buổi {{n}}', { n: q.sessionNumber })}</span>
                    <span>· {q.authorName}</span>
                    <span>· {timeAgo(q.createdAt)}</span>
                    {q.voteCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        · <ThumbsUp className="h-3 w-3" /> {q.voteCount}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
