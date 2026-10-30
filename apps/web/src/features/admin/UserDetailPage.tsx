import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { ClassDoc, MemberDoc, UserDoc } from '@classinteract/shared';
import { ROLE_LABELS, USER_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { formatDateTime } from '@/lib/utils';

export function UserDetailPage() {
  const { t } = useTranslation();
  const { uid } = useParams();
  const { data, isLoading, error } = useApi<{ user: UserDoc; memberships: MemberDoc[]; classes: ClassDoc[]; teaching: ClassDoc[] }>(`/users/${uid}`);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  const u = data.user;
  const memberOf = new Map(data.memberships.map((m) => [m.classId, m]));
  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/admin/users', label: t('Người dùng') }} title={u.displayName} description={u.studentId ? t('Mã SV {{id}}', { id: u.studentId }) : u.email} />
      <Card>
        <CardBody className="grid gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-muted">{t('Vai trò')}</p><p className="font-medium">{t(ROLE_LABELS[u.role])}</p></div>
          <div><p className="text-muted">{t('Trạng thái')}</p><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(USER_STATUS_LABELS[u.status])}</Badge></div>
          <div><p className="text-muted">{t('Tạo lúc')}</p><p>{formatDateTime(u.createdAt)}</p></div>
          <div><p className="text-muted">{t('Đăng nhập gần nhất')}</p><p>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</p></div>
        </CardBody>
      </Card>
      {data.teaching.length > 0 && (
        <Card>
          <CardHeader title={t('Lớp phụ trách')} />
          <CardBody className="flex flex-wrap gap-2">
            {data.teaching.map((c) => <Link key={c.classId} to={`/teach/classes/${c.classId}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50">{c.classCode} · {c.semester}</Link>)}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title={t('Lớp tham gia')} />
        <CardBody>
          {!data.classes.length ? <EmptyState title={t('Chưa tham gia lớp nào')} /> : (
            <ul className="space-y-2">
              {data.classes.map((c) => {
                const m = memberOf.get(c.classId);
                return (
                  <li key={c.classId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <Link to={`/teach/classes/${c.classId}/analytics/students/${u.uid}`} className="hover:text-primary">{c.classCode} – {c.courseName} ({c.semester})</Link>
                    <span className="flex gap-1">
                      {m?.role === 'ta' && <Badge tone="secondary">{t('Trợ giảng')}</Badge>}
                      <Badge tone={m?.status === 'active' ? 'success' : 'neutral'}>{m?.status === 'active' ? t('Đang học') : t('Đã rời lớp')}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
