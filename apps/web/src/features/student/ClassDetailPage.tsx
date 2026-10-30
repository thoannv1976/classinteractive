import { BarChart3, CalendarDays, ChevronRight, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ClassDoc, SessionDoc, SessionStatsDoc } from '@classinteract/shared';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';
import { SessionStatusBadge, sessionLabel, sessionTime } from '../common/SessionStatus';

export function ClassDetailPage() {
  const { classId } = useParams();
  const cls = useApi<{ class: ClassDoc; access: { canModerate: boolean; memberRole: string | null } }>(`/classes/${classId}`);
  const sessions = useApi<{ items: (SessionDoc & { stats: SessionStatsDoc | null })[] }>(`/classes/${classId}/sessions`, { refetchInterval: 30_000 });
  const { t } = useTranslation();
  if (cls.error) return <ErrorState error={cls.error} />;
  const c = cls.data?.class;
  const items = [...(sessions.data?.items ?? [])].sort((a, b) => b.sessionNumber - a.sessionNumber);
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/classes', label: t('Lớp học') }}
        title={c ? `${c.classCode} · ${c.courseName}` : t('Đang tải…')}
        description={c && `${c.lecturerNames.join(', ')} · ${c.semester} ${c.academicYear}${c.schedule ? ' · ' + c.schedule : ''}`}
        actions={
          <>
            {cls.data?.access.canModerate && (
              <Link to={`/teach/classes/${classId}/questions`} className={buttonVariants({ variant: 'soft' })}>
                <ShieldCheck className="h-4 w-4" /> {t('Hỗ trợ lớp (trợ giảng)')}
              </Link>
            )}
            <Link to={`/participation/${classId}`} className={buttonVariants({ variant: 'outline' })}>
              <BarChart3 className="h-4 w-4" /> {t('Mức độ tham gia của tôi')}
            </Link>
          </>
        }
      />
      <Card>
        <CardHeader title={t('Các buổi học')} description={t('Chọn buổi đang diễn ra để tham gia, hoặc xem lại hỏi đáp của các buổi trước.')} />
        <CardBody className="p-0 sm:p-0">
          {sessions.isLoading ? (
            <div className="p-4"><ListSkeleton rows={3} /></div>
          ) : !items.length ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t('Chưa có buổi học')} />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <li key={s.sessionId}>
                  <Link
                    to={`/classes/${classId}/sessions/${s.sessionId}`}
                    className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5', s.status === 'open' && 'bg-green-50/50')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{sessionLabel(s)}</span>
                        <SessionStatusBadge status={s.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {sessionTime(s)}
                        {s.stats && ' · ' + t('{{questions}} câu hỏi · {{answers}} trả lời', { questions: s.stats.questionCount ?? 0, answers: s.stats.answerCount ?? 0 })}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
