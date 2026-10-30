import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ClassDoc, StudentClassMetricsDoc } from '@classinteract/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { pct } from '@/lib/utils';

interface Item {
  class: ClassDoc;
  metrics: StudentClassMetricsDoc | null;
  derived: { attendanceRate: number | null; activityCompletionRate: number | null; quizAccuracy: number | null; interactions: number };
  opportunities: { sessionsHeld: number; activitiesOpened: number };
}

export function ParticipationPage() {
  const { data, isLoading, error, refetch } = useApi<{ items: Item[] }>('/me/participation');
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t('Mức độ tham gia của tôi')} description={t('Số liệu tính theo các buổi học và hoạt động giảng viên đã thực sự mở.')} />
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title={t('Chưa có dữ liệu')} />
      ) : (
        data.items.map((i) => (
          <Card key={i.class.classId}>
            <CardHeader
              title={`${i.class.classCode} · ${i.class.courseName}`}
              description={t('{{sessions}} buổi đã diễn ra · {{activities}} hoạt động đã mở', { sessions: i.opportunities.sessionsHeld, activities: i.opportunities.activitiesOpened })}
              actions={
                <Link to={`/participation/${i.class.classId}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {t('Chi tiết')} <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  [t('Buổi tham gia'), i.metrics?.sessionsJoined ?? 0],
                  [t('Tỷ lệ tham dự'), pct(i.derived.attendanceRate)],
                  [t('Câu hỏi', { context: 'n' }), i.metrics?.questions ?? 0],
                  [t('Câu trả lời'), i.metrics?.answers ?? 0],
                  [t('Hoạt động', { context: 'activity' }), i.metrics?.activitiesCompleted ?? 0],
                  [t('Hoàn thành HĐ'), pct(i.derived.activityCompletionRate)],
                  [t('Quiz đúng'), pct(i.derived.quizAccuracy)],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
