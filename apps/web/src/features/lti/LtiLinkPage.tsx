import { Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, ErrorState, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/query';
import { cn } from '@/lib/utils';

interface ContextInfo {
  context: { key: string; title: string; label: string; classId: string | null };
  classes: Array<{ classId: string; classCode: string; name: string; semester: string; academicYear: string; studentCount: number }>;
}
interface Course {
  courseId: string;
  code: string;
  name: string;
}

/** Lecturer links an LMS course (opened from Moodle) to a ClassInteract class. */
export function LtiLinkPage() {
  const { key = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useApi<ContextInfo>(`/lti/contexts/${key}`);
  const courses = useApi<{ items: Course[] }>('/courses');
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ courseId: '', newCourseCode: '', newCourseName: '', classCode: '', semester: 'HK1', academicYear: '2026-2027' });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const link = async (classId: string) => {
    setBusy(true);
    try {
      const r = await api.post<{ redirect: string }>(`/lti/contexts/${key}/link`, { classId });
      toast.success(t('Đã gắn lớp với khóa học trên LMS'));
      navigate(r.redirect, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createAndLink = async () => {
    setBusy(true);
    try {
      let courseId = form.courseId;
      if (!courseId) {
        courseId = (await api.post<{ courseId: string }>('/courses', { code: form.newCourseCode, name: form.newCourseName })).courseId;
      }
      const cls = await api.post<{ classId: string }>('/classes', {
        courseId,
        classCode: form.classCode,
        semester: form.semester,
        academicYear: form.academicYear,
      });
      await link(cls.classId);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  const c = data.context;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t('Gắn khóa học Moodle với lớp ClassInteract')}
        description={t('Khóa học trên LMS: {{title}}', { title: c.label ? `${c.title} (${c.label})` : c.title })}
      />
      <Alert tone="info">
        {t('Sinh viên mở hoạt động từ Moodle sẽ tự vào lớp đã gắn. Điểm tham gia được gửi về Sổ điểm Moodle khi bạn xác nhận điểm.')}
      </Alert>

      <Card>
        <CardHeader title={t('Chọn lớp bạn đang dạy')} />
        <CardBody className="space-y-2">
          {data.classes.length === 0 && <p className="text-sm text-muted">{t('Bạn chưa phụ trách lớp nào. Hãy tạo lớp mới bên dưới.')}</p>}
          {data.classes.map((x) => (
            <label
              key={x.classId}
              className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3', selected === x.classId && 'border-primary ring-2 ring-primary/30')}
            >
              <input type="radio" name="class" value={x.classId} checked={selected === x.classId} onChange={() => setSelected(x.classId)} />
              <span className="flex-1">
                <span className="font-medium">{x.classCode}</span> · {x.name}
                <span className="block text-xs text-muted">
                  {x.semester} {x.academicYear} · {t('{{n}} sinh viên', { n: x.studentCount })}
                </span>
              </span>
            </label>
          ))}
          {data.classes.length > 0 && (
            <Button disabled={!selected || busy} loading={busy && !creating} onClick={() => void link(selected)}>
              <Link2 className="h-4 w-4" /> {t('Gắn lớp đã chọn')}
            </Button>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('Hoặc tạo lớp mới')} actions={!creating && <Button variant="outline" onClick={() => { setCreating(true); setForm((f) => ({ ...f, classCode: c.label || '' })); }}><Plus className="h-4 w-4" /> {t('Tạo lớp mới')}</Button>} />
        {creating && (
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Học phần')}>
              <Select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
                <option value="">{t('+ Học phần mới')}</option>
                {(courses.data?.items ?? []).map((co) => (
                  <option key={co.courseId} value={co.courseId}>
                    {co.code} · {co.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!form.courseId && (
              <>
                <Field label={t('Mã học phần')}>
                  <Input value={form.newCourseCode} onChange={(e) => setForm({ ...form, newCourseCode: e.target.value })} />
                </Field>
                <Field label={t('Tên học phần')}>
                  <Input value={form.newCourseName} onChange={(e) => setForm({ ...form, newCourseName: e.target.value })} placeholder={c.title} />
                </Field>
              </>
            )}
            <Field label={t('Mã lớp')}>
              <Input value={form.classCode} onChange={(e) => setForm({ ...form, classCode: e.target.value })} />
            </Field>
            <Field label={t('Học kỳ')}>
              <Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
            </Field>
            <Field label={t('Năm học')}>
              <Input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button
                disabled={busy || !form.classCode || (!form.courseId && (!form.newCourseCode || !form.newCourseName))}
                loading={busy && creating}
                onClick={() => void createAndLink()}
              >
                {t('Tạo lớp và gắn với khóa học')}
              </Button>
            </div>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
