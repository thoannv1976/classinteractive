import { ArrowRight, BookOpen, Radio } from 'lucide-react';
import { Link } from 'react-router';
import type { ClassDoc, SessionDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader, StatCard } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { pct } from '@/lib/utils';
import { JoinByCode } from './JoinByCode';

export interface LiveItem {
  session: SessionDoc;
  class: { classId: string; classCode: string; name: string; courseName: string };
}

export function LiveSessionList({ items }: { items: LiveItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map(({ session: s, class: c }) => (
        <li key={s.sessionId}>
          <Link
            to={`/classes/${c.classId}/sessions/${s.sessionId}`}
            className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 p-3 transition-colors hover:bg-primary-soft"
          >
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
              <Radio className="h-5 w-5" />
              {s.status === 'open' && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-accent" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.classCode} · Buổi {s.sessionNumber}: {s.title}</span>
              <span className="block text-xs text-muted">{s.status === 'open' ? 'Đang diễn ra – nhấn để tham gia' : 'Tạm dừng'}</span>
            </span>
            <ArrowRight className="h-5 w-5 text-primary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface Participation {
  items: { class: ClassDoc; metrics: Record<string, number> | null; derived: { attendanceRate: number | null; activityCompletionRate: number | null; interactions: number } }[];
}

export function StudentHome() {
  const me = useMe();
  const live = useApi<{ items: LiveItem[] }>('/me/live-sessions', { refetchInterval: 30_000 });
  const part = useApi<Participation>('/me/participation');
  const totals = (part.data?.items ?? []).reduce(
    (t, i) => ({ q: t.q + (i.metrics?.questions ?? 0), a: t.a + (i.metrics?.answers ?? 0), act: t.act + (i.metrics?.activitiesCompleted ?? 0), s: t.s + (i.metrics?.sessionsJoined ?? 0) }),
    { q: 0, a: 0, act: 0, s: 0 },
  );
  return (
    <div className="space-y-6">
      <PageHeader title={`Xin chào, ${me.displayName}`} description={`Mã sinh viên ${me.studentId}`} />
      <Card>
        <CardHeader title="Buổi học đang diễn ra" description="Tham gia để đặt câu hỏi và làm hoạt động trên lớp" />
        <CardBody className="space-y-4">
          {live.isLoading ? <ListSkeleton rows={1} /> : live.data?.items.length ? <LiveSessionList items={live.data.items} /> : <p className="text-sm text-muted">Hiện chưa có buổi học nào đang mở.</p>}
          <JoinByCode />
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Buổi đã tham gia" value={totals.s} tone="primary" />
        <StatCard label="Câu hỏi" value={totals.q} tone="accent" />
        <StatCard label="Câu trả lời" value={totals.a} tone="secondary" />
        <StatCard label="Hoạt động hoàn thành" value={totals.act} tone="neutral" />
      </div>
      <Card>
        <CardHeader
          title="Lớp học của tôi"
          actions={
            <Link to="/classes" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Xem tất cả <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <CardBody>
          {part.isLoading ? (
            <ListSkeleton rows={2} />
          ) : part.error ? (
            <ErrorState error={part.error} onRetry={() => part.refetch()} />
          ) : !part.data?.items.length ? (
            <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Bạn chưa có lớp nào" description="Liên hệ giảng viên để được thêm vào danh sách lớp, hoặc gửi yêu cầu tham gia bằng mã lớp." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {part.data.items.map(({ class: c, derived }) => (
                <li key={c.classId}>
                  <Link to={`/classes/${c.classId}`} className="block rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{c.classCode}</span>
                      <Badge>{c.semester}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">{c.courseName}</p>
                    <div className="mt-3 flex gap-4 text-xs text-muted">
                      <span>Tham dự <b className="text-fg">{pct(derived.attendanceRate)}</b></span>
                      <span>Hoàn thành HĐ <b className="text-fg">{pct(derived.activityCompletionRate)}</b></span>
                      <span>Tương tác <b className="text-fg">{derived.interactions}</b></span>
                    </div>
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
