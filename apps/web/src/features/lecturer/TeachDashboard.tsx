import { AlertCircle, ArrowRight, GraduationCap, MessageCircleQuestion, Radio, UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ClassDoc, ClassStatsDoc, SessionDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader, StatCard } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { sessionLabel } from '../common/SessionStatus';

interface Overview {
  items: { class: ClassDoc; stats: ClassStatsDoc | null; liveSessions: SessionDoc[]; pendingRequests: number }[];
}

export function TeachDashboard() {
  const { t } = useTranslation();
  const me = useMe();
  const { data, isLoading, error, refetch } = useApi<Overview>('/teach/overview', { refetchInterval: 30_000 });
  const items = data?.items ?? [];
  const sum = (f: (i: Overview['items'][number]) => number) => items.reduce((s, i) => s + f(i), 0);
  const live = items.flatMap((i) => i.liveSessions.map((s) => ({ s, c: i.class })));
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Chào {{name}}', { name: me.displayName })}
        description={t('Tổng quan các lớp bạn phụ trách')}
        actions={
          <Link to="/teach/classes?new=1" className={buttonVariants()}>
            <GraduationCap className="h-4 w-4" /> {t('Tạo lớp học phần')}
          </Link>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('Lớp phụ trách')} value={items.length} icon={<GraduationCap className="h-4 w-4" />} />
        <StatCard label={t('Sinh viên', { context: 'n' })} value={sum((i) => i.class.studentCount)} icon={<Users className="h-4 w-4" />} tone="secondary" />
        <StatCard label={t('Câu hỏi chưa giải đáp')} value={sum((i) => i.stats?.openQuestionCount ?? 0)} icon={<MessageCircleQuestion className="h-4 w-4" />} tone="accent" />
        <StatCard label={t('Yêu cầu vào lớp')} value={sum((i) => i.pendingRequests)} icon={<UserPlus className="h-4 w-4" />} tone="neutral" />
      </div>
      {live.length > 0 && (
        <Card className="border-green-200">
          <CardHeader title={t('Đang diễn ra')} />
          <CardBody className="space-y-2">
            {live.map(({ s, c }) => (
              <Link key={s.sessionId} to={`/teach/classes/${c.classId}/sessions/${s.sessionId}`} className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/60 p-3 hover:bg-green-50">
                <Radio className="h-5 w-5 text-success" />
                <span className="flex-1 text-sm font-medium">{c.classCode} · {sessionLabel(s)}</span>
                <span className="font-mono text-sm tracking-widest">{s.joinCode}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title={t('Lớp học phần')} />
        <CardBody>
          {isLoading ? (
            <ListSkeleton rows={2} />
          ) : !items.length ? (
            <EmptyState icon={<GraduationCap className="h-6 w-6" />} title={t('Bạn chưa phụ trách lớp nào')} description={t('Tạo lớp học phần mới hoặc liên hệ quản trị viên để được phân công.')} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map(({ class: c, stats, pendingRequests, liveSessions }) => (
                <li key={c.classId}>
                  <Link to={`/teach/classes/${c.classId}`} className="block rounded-xl border border-border p-4 transition hover:border-primary/40 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{c.classCode}</span>
                      <div className="flex gap-1">
                        {liveSessions.length > 0 && <Badge tone="success">{t('Đang học')}</Badge>}
                        {pendingRequests > 0 && <Badge tone="accent">{t('{{count}} yêu cầu', { count: pendingRequests })}</Badge>}
                      </div>
                    </div>
                    <p className="truncate text-sm text-muted">{c.courseName} · {c.semester}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
                      <div><b className="block text-base text-fg">{c.studentCount}</b>{t('SV')}</div>
                      <div><b className="block text-base text-fg">{stats?.sessionsHeld ?? 0}</b>{t('buổi')}</div>
                      <div>
                        <b className={`block text-base ${(stats?.openQuestionCount ?? 0) > 0 ? 'text-accent' : 'text-fg'}`}>{stats?.openQuestionCount ?? 0}</b>{t('chưa giải đáp')}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <AlertCircle className="h-4 w-4" /> {t('Số liệu tham gia là tín hiệu để giảng viên quan tâm, không tự động kết luận về năng lực hay sự cố gắng của sinh viên.')}
      </p>
    </div>
  );
}
