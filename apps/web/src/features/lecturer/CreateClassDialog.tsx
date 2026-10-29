import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CourseDoc, UserDoc } from '@classinteract/shared';
import { isAdminRole } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { invalidate, useApi } from '@/lib/query';

const thisYear = new Date().getFullYear();

export function CreateClassDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const courses = useApi<{ items: CourseDoc[] }>(open ? '/courses' : null);
  const lecturers = useApi<{ items: UserDoc[] }>(open && isAdminRole(me.role) ? '/users?role=lecturer&limit=200' : null);
  const [courseId, setCourseId] = useState('');
  const [newCourse, setNewCourse] = useState({ code: '', name: '' });
  const [form, setForm] = useState({ classCode: '', name: '', semester: 'HK1', academicYear: `${thisYear}-${thisYear + 1}`, schedule: '' });
  const [lecturerId, setLecturerId] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      let cid = courseId;
      if (cid === '__new') {
        const r = await api.post<{ courseId: string }>('/courses', { ...newCourse, description: '' });
        cid = r.courseId;
      }
      const r = await api.post<{ classId: string }>('/classes', {
        courseId: cid,
        ...form,
        lecturerIds: lecturerId ? [lecturerId] : undefined,
      });
      await invalidate('/classes', '/teach', '/courses');
      toast.success('Đã tạo lớp học phần');
      onOpenChange(false);
      navigate(`/teach/classes/${r.classId}/students`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = (courseId && courseId !== '__new') || (courseId === '__new' && newCourse.code && newCourse.name);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tạo lớp học phần"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!valid || !form.classCode || !form.semester || !form.academicYear}>
            Tạo lớp
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Học phần" htmlFor="course" className="sm:col-span-2">
          <Select id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">— Chọn học phần —</option>
            {courses.data?.items.map((c) => (
              <option key={c.courseId} value={c.courseId}>{c.code} – {c.name}</option>
            ))}
            <option value="__new">+ Thêm học phần mới</option>
          </Select>
        </Field>
        {courseId === '__new' && (
          <>
            <Field label="Mã học phần" htmlFor="ccode">
              <Input id="ccode" value={newCourse.code} onChange={(e) => setNewCourse((c) => ({ ...c, code: e.target.value }))} placeholder="DGB301" />
            </Field>
            <Field label="Tên học phần" htmlFor="cname">
              <Input id="cname" value={newCourse.name} onChange={(e) => setNewCourse((c) => ({ ...c, name: e.target.value }))} placeholder="Kinh doanh số" />
            </Field>
          </>
        )}
        <Field label="Mã lớp học phần" htmlFor="code">
          <Input id="code" value={form.classCode} onChange={set('classCode')} placeholder="DGB301.01" />
        </Field>
        <Field label="Tên lớp (không bắt buộc)" htmlFor="name">
          <Input id="name" value={form.name} onChange={set('name')} placeholder="Mặc định theo tên học phần" />
        </Field>
        <Field label="Học kỳ" htmlFor="sem">
          <Input id="sem" value={form.semester} onChange={set('semester')} placeholder="HK1" />
        </Field>
        <Field label="Năm học" htmlFor="ay">
          <Input id="ay" value={form.academicYear} onChange={set('academicYear')} placeholder="2026-2027" />
        </Field>
        <Field label="Lịch học" htmlFor="sch" className="sm:col-span-2">
          <Input id="sch" value={form.schedule} onChange={set('schedule')} placeholder="Thứ 3, tiết 1–3, phòng A2.05" />
        </Field>
        {isAdminRole(me.role) && (
          <Field label="Giảng viên phụ trách" htmlFor="lec" className="sm:col-span-2">
            <Select id="lec" value={lecturerId} onChange={(e) => setLecturerId(e.target.value)}>
              <option value="">— Chưa phân công —</option>
              {lecturers.data?.items.map((u) => (
                <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Dialog>
  );
}
