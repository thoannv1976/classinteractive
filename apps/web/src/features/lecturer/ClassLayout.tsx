import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import type { ClassDoc } from '@classinteract/shared';
import { CLASS_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { tk } from '@/i18n';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

export interface ClassCtx {
  cls: ClassDoc;
  access: { canManage: boolean; canModerate: boolean; memberRole: string | null };
  refetch: () => void;
}

export const useClassCtx = () => useOutletContext<ClassCtx>();

const TABS = [
  { to: '', label: tk('Tổng quan'), end: true },
  { to: 'sessions', label: tk('Buổi học') },
  { to: 'questions', label: tk('Câu hỏi chờ xử lý') },
  { to: 'students', label: tk('Sinh viên') },
  { to: 'analytics', label: tk('Mức độ tham gia') },
  { to: 'topics', label: tk('Chủ đề') },
  { to: 'reports', label: tk('Báo cáo') },
  { to: 'settings', label: tk('Cài đặt'), manage: true },
];

export function ClassLayout() {
  const { t } = useTranslation();
  const { classId } = useParams();
  const { data, error, isLoading, refetch } = useApi<{ class: ClassDoc; access: ClassCtx['access'] }>(`/classes/${classId}`);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  const c = data.class;
  return (
    <div>
      <PageHeader
        back={{ to: '/teach/classes', label: t('Lớp giảng dạy') }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.classCode} <span className="font-normal text-muted">· {c.courseName}</span>
            {c.status !== 'active' && <Badge tone="warning">{t(CLASS_STATUS_LABELS[c.status])}</Badge>}
          </span>
        }
        description={`${c.semester} ${c.academicYear} · ${c.lecturerNames.join(', ') || t('Chưa phân công giảng viên')} · ${t('{{count}} sinh viên', { count: c.studentCount })}${c.schedule ? ' · ' + c.schedule : ''}`}
        className="mb-3"
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin print:hidden" aria-label={t('Quản lý lớp')}>
        {TABS.filter((tab) => !tab.manage || data.access.canManage).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn('-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted hover:text-fg', isActive && 'border-primary text-primary')
            }
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ cls: c, access: data.access, refetch } satisfies ClassCtx} />
    </div>
  );
}
