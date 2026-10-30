import { GraduationCap, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { ClassDoc } from '@classinteract/shared';
import { CLASS_STATUS_LABELS, isAdminRole } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { useMe } from '@/lib/auth';
import { useApi } from '@/lib/query';
import { CreateClassDialog } from './CreateClassDialog';

export function TeachClassesPage() {
  const { t } = useTranslation();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(params.get('new') === '1');
  useEffect(() => {
    if (params.get('new')) setParams({}, { replace: true });
  }, [params, setParams]);
  const { data, isLoading, error, refetch } = useApi<{ items: ClassDoc[] }>(isAdminRole(me.role) ? '/classes?all=true' : '/classes');
  const items = (data?.items ?? []).filter((c) => !q || `${c.classCode} ${c.courseName} ${c.semester} ${c.lecturerNames.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader
        title={isAdminRole(me.role) ? t('Tất cả lớp học phần') : t('Lớp giảng dạy')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {t('Tạo lớp')}
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tìm theo mã lớp, học phần, giảng viên…')} aria-label={t('Tìm lớp')} />
      </div>
      <Card>
        {isLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !items.length ? (
          <EmptyState icon={<GraduationCap className="h-6 w-6" />} title={t('Chưa có lớp')} action={<Button onClick={() => setOpen(true)}>{t('Tạo lớp đầu tiên')}</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('Mã lớp')}</Th>
                <Th>{t('Học phần')}</Th>
                <Th>{t('Học kỳ')}</Th>
                <Th>{t('Giảng viên')}</Th>
                <Th className="text-right">{t('Sinh viên', { context: 'n' })}</Th>
                <Th className="text-right">{t('Buổi')}</Th>
                <Th>{t('Trạng thái')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.classId} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`/teach/classes/${c.classId}`} className="font-semibold text-primary hover:underline">{c.classCode}</Link>
                  </Td>
                  <Td>{c.courseName}</Td>
                  <Td>{c.semester} · {c.academicYear}</Td>
                  <Td className="max-w-[220px] truncate">{c.lecturerNames.join(', ') || <span className="text-danger">{t('Chưa phân công')}</span>}</Td>
                  <Td className="text-right tabular-nums">{c.studentCount}</Td>
                  <Td className="text-right tabular-nums">{c.sessionCount}</Td>
                  <Td><Badge tone={c.status === 'active' ? 'success' : 'warning'}>{t(CLASS_STATUS_LABELS[c.status])}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CreateClassDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
