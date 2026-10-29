import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
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
  return (
    <div className="space-y-6">
      <PageHeader title="Mức độ tham gia của tôi" description="Số liệu tính theo các buổi học và hoạt động giảng viên đã thực sự mở." />
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="Chưa có dữ liệu" />
      ) : (
        data.items.map((i) => (
          <Card key={i.class.classId}>
            <CardHeader
              title={`${i.class.classCode} · ${i.class.courseName}`}
              description={`${i.opportunities.sessionsHeld} buổi đã diễn ra · ${i.opportunities.activitiesOpened} hoạt động đã mở`}
              actions={
                <Link to={`/participation/${i.class.classId}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Chi tiết <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ['Buổi tham gia', i.metrics?.sessionsJoined ?? 0],
                  ['Tỷ lệ tham dự', pct(i.derived.attendanceRate)],
                  ['Câu hỏi', i.metrics?.questions ?? 0],
                  ['Câu trả lời', i.metrics?.answers ?? 0],
                  ['Hoạt động', i.metrics?.activitiesCompleted ?? 0],
                  ['Hoàn thành HĐ', pct(i.derived.activityCompletionRate)],
                  ['Quiz đúng', pct(i.derived.quizAccuracy)],
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
