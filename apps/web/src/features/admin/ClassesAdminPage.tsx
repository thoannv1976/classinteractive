import { Plus, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ClassDoc, CourseDoc, UserDoc } from '@classinteract/shared';
import { CLASS_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ListSkeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { CreateClassDialog } from '../lecturer/CreateClassDialog';

export function ClassesAdminPage() {
  const { t } = useTranslation();
  const courses = useApi<{ items: CourseDoc[] }>('/courses');
  const classes = useApi<{ items: ClassDoc[] }>('/classes?all=true');
  const [courseOpen, setCourseOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [assign, setAssign] = useState<ClassDoc | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title={t('Lớp & học phần')} description={t('Quản lý danh mục học phần, lớp học phần và phân công giảng viên.')} />
      <Card>
        <CardHeader title={t('Học phần ({{n}})', { n: courses.data?.items.length ?? 0 })} actions={<Button size="sm" onClick={() => setCourseOpen(true)}><Plus className="h-4 w-4" /> {t('Thêm học phần')}</Button>} />
        {courses.isLoading ? <div className="p-4"><ListSkeleton rows={2} /></div> : !courses.data?.items.length ? <EmptyState title={t('Chưa có học phần')} /> : (
          <Table>
            <thead><tr><Th>{t('Mã')}</Th><Th>{t('Tên học phần')}</Th><Th>{t('Mô tả')}</Th><Th className="text-right">{t('Số lớp')}</Th></tr></thead>
            <tbody>
              {courses.data.items.map((c) => (
                <tr key={c.courseId}>
                  <Td className="font-mono text-xs font-semibold">{c.code}</Td>
                  <Td>{c.name}</Td>
                  <Td className="max-w-md truncate text-muted">{c.description}</Td>
                  <Td className="text-right tabular-nums">{classes.data?.items.filter((x) => x.courseId === c.courseId).length ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title={t('Lớp học phần ({{n}})', { n: classes.data?.items.length ?? 0 })} actions={<Button size="sm" onClick={() => setClassOpen(true)}><Plus className="h-4 w-4" /> {t('Tạo lớp')}</Button>} />
        {classes.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : !classes.data?.items.length ? <EmptyState title={t('Chưa có lớp')} /> : (
          <Table>
            <thead><tr><Th>{t('Mã lớp')}</Th><Th>{t('Học phần')}</Th><Th>{t('Học kỳ')}</Th><Th>{t('Giảng viên')}</Th><Th className="text-right">{t('SV')}</Th><Th>{t('Trạng thái')}</Th><Th /></tr></thead>
            <tbody>
              {classes.data.items.map((c) => (
                <tr key={c.classId} className="hover:bg-slate-50">
                  <Td><Link to={`/teach/classes/${c.classId}`} className="font-semibold text-primary hover:underline">{c.classCode}</Link></Td>
                  <Td>{c.courseName}</Td>
                  <Td>{c.semester} · {c.academicYear}</Td>
                  <Td>{c.lecturerNames.join(', ') || <span className="text-danger">{t('Chưa phân công')}</span>}</Td>
                  <Td className="text-right tabular-nums">{c.studentCount}</Td>
                  <Td><Badge tone={c.status === 'active' ? 'success' : 'warning'}>{t(CLASS_STATUS_LABELS[c.status])}</Badge></Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setAssign(c)}><UserCog className="h-4 w-4" /> {t('Phân công')}</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CourseDialog open={courseOpen} onOpenChange={setCourseOpen} />
      <CreateClassDialog open={classOpen} onOpenChange={setClassOpen} />
      <AssignDialog cls={assign} onClose={() => setAssign(null)} />
    </div>
  );
}

function CourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ code: '', name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/courses', f);
      await invalidate('/courses');
      toast.success(t('Đã thêm học phần'));
      onOpenChange(false);
      setF({ code: '', name: '', description: '' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Thêm học phần')} size="sm" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('Hủy')}</Button><Button onClick={save} loading={busy} disabled={!f.code || !f.name}>{t('Lưu')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('Mã học phần')} htmlFor="c"><Input id="c" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="DGB301" /></Field>
        <Field label={t('Tên học phần')} htmlFor="n"><Input id="n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Kinh doanh số')} /></Field>
        <Field label={t('Mô tả')} htmlFor="d"><Textarea id="d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function AssignDialog({ cls, onClose }: { cls: ClassDoc | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lecturers = useApi<{ items: UserDoc[] }>(cls ? '/users?role=lecturer&limit=200' : null);
  const admins = useApi<{ items: UserDoc[] }>(cls ? '/users?role=admin&limit=200' : null);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (cls) setIds(cls.lecturerIds);
  }, [cls]);
  const people = [...(lecturers.data?.items ?? []), ...(admins.data?.items ?? [])].filter((u) => u.status === 'active');
  const save = async () => {
    if (!cls) return;
    setBusy(true);
    try {
      await api.patch(`/classes/${cls.classId}`, { lecturerIds: ids });
      await invalidate('/classes', '/teach');
      toast.success(t('Đã cập nhật phân công'));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!cls} onOpenChange={(v) => !v && onClose()} title={t('Phân công giảng viên')} description={cls ? `${cls.classCode} – ${cls.courseName}` : ''} footer={<><Button variant="outline" onClick={onClose}>{t('Hủy')}</Button><Button onClick={save} loading={busy} disabled={!ids.length}>{t('Lưu')}</Button></>}>
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {people.map((u) => (
          <li key={u.uid}>
            <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={ids.includes(u.uid)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, u.uid] : x.filter((y) => y !== u.uid)))} />
              <span className="text-sm">{u.displayName} <span className="text-muted">({u.email})</span></span>
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
