import { Bot, BookOpen, GraduationCap, Radio, UserCog, UserX, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { PageHeader, StatCard } from '@/components/ui/misc';
import { useApi } from '@/lib/query';

interface Overview {
  users: Record<string, number>;
  disabledUsers: number;
  classes: number;
  activeClasses: number;
  liveSessions: number;
  unregisteredStudents: number;
  aiThisMonth: { costUsd: number; runs: number };
}

export function AdminDashboard() {
  const { data, isLoading, error } = useApi<Overview>('/admin/overview');
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <div className="space-y-6">
      <PageHeader title="Quản trị hệ thống" description="Tổng quan tài khoản, lớp học và sử dụng AI" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sinh viên" value={data.users.student ?? 0} hint={`${data.unregisteredStudents} mã SV chưa đăng ký`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Giảng viên" value={data.users.lecturer ?? 0} icon={<GraduationCap className="h-4 w-4" />} tone="secondary" />
        <StatCard label="Quản trị" value={(data.users.admin ?? 0) + (data.users.superadmin ?? 0)} icon={<UserCog className="h-4 w-4" />} tone="neutral" />
        <StatCard label="Tài khoản bị khóa" value={data.disabledUsers} icon={<UserX className="h-4 w-4" />} tone="danger" />
        <StatCard label="Lớp đang hoạt động" value={`${data.activeClasses}/${data.classes}`} icon={<BookOpen className="h-4 w-4" />} tone="primary" />
        <StatCard label="Buổi học đang diễn ra" value={data.liveSessions} icon={<Radio className="h-4 w-4" />} tone="secondary" />
        <StatCard label="Lượt AI tháng này" value={data.aiThisMonth.runs} icon={<Bot className="h-4 w-4" />} tone="accent" />
        <StatCard label="Chi phí AI ước tính" value={`$${data.aiThisMonth.costUsd.toFixed(2)}`} hint="Tháng hiện tại" icon={<Bot className="h-4 w-4" />} tone="accent" />
      </div>
      <Card>
        <CardHeader title="Thao tác nhanh" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['/admin/users?new=lecturer', 'Tạo tài khoản giảng viên'],
            ['/admin/classes', 'Tạo lớp, phân công giảng viên'],
            ['/admin/ai', 'Cấu hình nhà cung cấp AI'],
            ['/admin/audit', 'Xem nhật ký thao tác'],
          ] as const).map(([to, l]) => (
            <Link key={to} to={to} className="rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-primary/40 hover:bg-slate-50">
              {l} →
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
