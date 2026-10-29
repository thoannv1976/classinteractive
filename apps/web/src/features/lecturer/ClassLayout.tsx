import { NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import type { ClassDoc } from '@classinteract/shared';
import { CLASS_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

export interface ClassCtx {
  cls: ClassDoc;
  access: { canManage: boolean; canModerate: boolean; memberRole: string | null };
  refetch: () => void;
}

export const useClassCtx = () => useOutletContext<ClassCtx>();

const TABS = [
  { to: '', label: 'Tổng quan', end: true },
  { to: 'sessions', label: 'Buổi học' },
  { to: 'questions', label: 'Câu hỏi chờ xử lý' },
  { to: 'students', label: 'Sinh viên' },
  { to: 'analytics', label: 'Mức độ tham gia' },
  { to: 'topics', label: 'Chủ đề' },
  { to: 'reports', label: 'Báo cáo' },
  { to: 'settings', label: 'Cài đặt', manage: true },
];

export function ClassLayout() {
  const { classId } = useParams();
  const { data, error, isLoading, refetch } = useApi<{ class: ClassDoc; access: ClassCtx['access'] }>(`/classes/${classId}`);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  const c = data.class;
  return (
    <div>
      <PageHeader
        back={{ to: '/teach/classes', label: 'Lớp giảng dạy' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.classCode} <span className="font-normal text-muted">· {c.courseName}</span>
            {c.status !== 'active' && <Badge tone="warning">{CLASS_STATUS_LABELS[c.status]}</Badge>}
          </span>
        }
        description={`${c.semester} ${c.academicYear} · ${c.lecturerNames.join(', ') || 'Chưa phân công giảng viên'} · ${c.studentCount} sinh viên${c.schedule ? ' · ' + c.schedule : ''}`}
        className="mb-3"
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin print:hidden" aria-label="Quản lý lớp">
        {TABS.filter((t) => !t.manage || data.access.canManage).map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn('-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted hover:text-fg', isActive && 'border-primary text-primary')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ cls: c, access: data.access, refetch } satisfies ClassCtx} />
    </div>
  );
}
