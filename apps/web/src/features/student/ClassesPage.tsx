import { BookOpen, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ClassDoc } from '@classinteract/shared';
import { CLASS_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { RequestJoinDialog } from './RequestJoinDialog';

export function ClassesPage() {
  const { data, isLoading, error, refetch } = useApi<{ items: ClassDoc[] }>('/classes');
  const [requestOpen, setRequestOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        title={t('Lớp học của tôi')}
        description={t('Các lớp học phần bạn được phân công tham gia')}
        actions={
          <Button variant="outline" onClick={() => setRequestOpen(true)}>
            <Plus className="h-4 w-4" /> {t('Xin tham gia lớp')}
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t('Chưa có lớp nào')} description={t('Bạn sẽ thấy lớp ở đây khi giảng viên thêm bạn vào danh sách lớp.')} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((c) => (
            <li key={c.classId}>
              <Link to={`/classes/${c.classId}`} className="block h-full rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{c.classCode}</p>
                    <p className="text-sm text-muted">{c.courseName}</p>
                  </div>
                  {c.status !== 'active' && <Badge tone="warning">{t(CLASS_STATUS_LABELS[c.status])}</Badge>}
                </div>
                <div className="mt-4 space-y-1 text-sm text-muted">
                  <p>{t('Giảng viên:')} <span className="text-fg">{c.lecturerNames.join(', ') || '—'}</span></p>
                  <p>{c.semester} · {c.academicYear}</p>
                  <p className="flex items-center gap-1"><Users className="h-4 w-4" /> {t('{{students}} sinh viên · {{sessions}} buổi học', { students: c.studentCount, sessions: c.sessionCount })}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <RequestJoinDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}
