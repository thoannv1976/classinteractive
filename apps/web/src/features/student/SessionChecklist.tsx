import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoreConfig } from '@classinteract/shared';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

export interface SessionProgress {
  joined: boolean;
  questions: number;
  contributions: number;
  caps: ScoreConfig['caps'];
  activities: { opened: number; done: number; open: number };
  exitTickets: { opened: number; done: number; open: number };
}

/**
 * "Tasks for this session": what the student has done here against what the engagement score
 * counts per session, so a student arriving from the LMS knows exactly what to do.
 * `bump` changes whenever the feed or the activities change, to refresh the counts.
 */
export function SessionChecklist({ classId, sessionId, bump, onOpenTab }: { classId: string; sessionId: string; bump: string; onOpenTab: (tab: 'qa' | 'activities') => void }) {
  const { t } = useTranslation();
  const { data, refetch } = useApi<SessionProgress>(`/classes/${classId}/sessions/${sessionId}/my-progress`, { refetchInterval: 20_000, retry: false });
  useEffect(() => {
    void refetch();
  }, [bump, refetch]);
  if (!data) return null;
  const { caps } = data;
  const items: Array<{ done: boolean; label: ReactNode; tab?: 'qa' | 'activities' }> = [
    { done: data.joined, label: t('Vào buổi học (tự điểm danh khi bạn mở trang này)') },
    { done: data.questions >= caps.questions, label: t('Đặt câu hỏi: {{n}}/{{cap}}', { n: Math.min(data.questions, caps.questions), cap: caps.questions }), tab: 'qa' },
    { done: data.contributions >= caps.answers, label: t('Trả lời hoặc thảo luận câu hỏi của bạn khác: {{n}}/{{cap}}', { n: Math.min(data.contributions, caps.answers), cap: caps.answers }), tab: 'qa' },
  ];
  if (data.activities.opened > 0)
    items.push({ done: data.activities.done >= data.activities.opened, label: t('Làm hoạt động giảng viên mở: {{n}}/{{total}}', { n: data.activities.done, total: data.activities.opened }), tab: 'activities' });
  if (data.exitTickets.opened > 0)
    items.push({ done: data.exitTickets.done >= data.exitTickets.opened, label: t('Nộp phiếu cuối buổi: {{n}}/{{total}}', { n: data.exitTickets.done, total: data.exitTickets.opened }), tab: 'activities' });
  const doneCount = items.filter((i) => i.done).length;
  return (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> {t('Nhiệm vụ buổi này')}
          </p>
          <span className={cn('text-xs font-medium', doneCount === items.length ? 'text-success' : 'text-muted')}>
            {doneCount === items.length ? t('Đã đủ, tuyệt vời!') : t('Đã xong {{n}}/{{total}}', { n: doneCount, total: items.length })}
          </span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!it.tab}
                onClick={() => it.tab && onOpenTab(it.tab)}
                className={cn('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm', it.tab && 'hover:bg-slate-50', it.done && 'text-muted')}
              >
                {it.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {data.activities.open + data.exitTickets.open > 0 && (
          <p className="text-xs text-accent">{t('Có {{n}} hoạt động đang mở chờ bạn ở tab "Hoạt động".', { n: data.activities.open + data.exitTickets.open })}</p>
        )}
        <p className="text-xs text-muted">{t('Mỗi buổi chỉ tính đến mức tối đa ở trên; làm nhiều hơn không cộng thêm điểm.')}</p>
      </CardBody>
    </Card>
  );
}
