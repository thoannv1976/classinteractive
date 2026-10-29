import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AiProvider, ClassSettings, ClassStatus } from '@classinteract/shared';
import { CLASS_STATUS_LABELS } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { invalidate } from '@/lib/query';
import { useClassCtx } from './ClassLayout';

export function ClassSettingsPage() {
  const { cls, refetch } = useClassCtx();
  const [info, setInfo] = useState({ name: cls.name, semester: cls.semester, academicYear: cls.academicYear, schedule: cls.schedule, status: cls.status });
  const [st, setSt] = useState<ClassSettings>(cls.settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSt(cls.settings);
  }, [cls.settings]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/classes/${cls.classId}`, { ...info, settings: st });
      await invalidate('/classes', '/teach');
      refetch();
      toast.success('Đã lưu cài đặt lớp');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const set = <K extends keyof ClassSettings>(k: K, v: ClassSettings[K]) => setSt((s) => ({ ...s, [k]: v }));

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Thông tin lớp" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên lớp" htmlFor="n"><Input id="n" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></Field>
          <Field label="Lịch học" htmlFor="s"><Input id="s" value={info.schedule} onChange={(e) => setInfo({ ...info, schedule: e.target.value })} /></Field>
          <Field label="Học kỳ" htmlFor="sem"><Input id="sem" value={info.semester} onChange={(e) => setInfo({ ...info, semester: e.target.value })} /></Field>
          <Field label="Năm học" htmlFor="ay"><Input id="ay" value={info.academicYear} onChange={(e) => setInfo({ ...info, academicYear: e.target.value })} /></Field>
          <Field label="Trạng thái lớp" htmlFor="stt" hint="Lớp bị khóa: sinh viên chỉ xem, không gửi tương tác mới.">
            <Select id="stt" value={info.status} onChange={(e) => setInfo({ ...info, status: e.target.value as ClassStatus })}>
              {(Object.keys(CLASS_STATUS_LABELS) as ClassStatus[]).map((k) => <option key={k} value={k}>{CLASS_STATUS_LABELS[k]}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Tương tác" />
        <CardBody className="space-y-4">
          <Switch id="anon" checked={st.allowAnonymous} onCheckedChange={(v) => set('allowAnonymous', v)} label="Cho phép đặt câu hỏi ẩn danh" description="Tên sinh viên được ẩn với các bạn khác. Hệ thống vẫn ghi nhận để tính mức độ tham gia và chống lạm dụng." />
          <Switch id="reveal" checked={st.revealAnonymousToStaff} onCheckedChange={(v) => set('revealAnonymousToStaff', v)} label="Giảng viên được xem danh tính bài ẩn danh" description="Sinh viên được thông báo rõ chính sách này khi gửi bài. Mỗi lần xem được ghi nhật ký." />
          <Field label="Thời gian cho phép sửa/xóa bài (phút)" htmlFor="ew">
            <Input id="ew" type="number" min={0} max={1440} value={st.editWindowMinutes} onChange={(e) => set('editWindowMinutes', Number(e.target.value))} className="max-w-[140px]" />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Trợ lý AI" description="AI chỉ là công cụ hỗ trợ; mặc định mọi câu trả lời AI cần giảng viên duyệt." />
        <CardBody className="space-y-4">
          <Switch id="ai" checked={st.aiEnabled} onCheckedChange={(v) => set('aiEnabled', v)} label="Bật AI cho lớp này" />
          <Field label="Chế độ" htmlFor="mode">
            <Select id="mode" value={st.aiMode} onChange={(e) => set('aiMode', e.target.value as ClassSettings['aiMode'])} disabled={!st.aiEnabled}>
              <option value="assistant">AI Assistant – AI soạn nháp, giảng viên duyệt trước khi công bố (khuyến nghị)</option>
              <option value="student_support">AI Student Support – sinh viên được hỏi AI cho câu hỏi của mình (có nhãn AI)</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nhà cung cấp" htmlFor="prov">
              <Select id="prov" value={st.aiProvider ?? ''} onChange={(e) => set('aiProvider', (e.target.value || null) as AiProvider | null)} disabled={!st.aiEnabled}>
                <option value="">Theo cấu hình hệ thống</option>
                <option value="anthropic">Claude</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </Select>
            </Field>
            <Field label="Lượt AI/ngày của lớp" htmlFor="q1">
              <Input id="q1" type="number" min={0} value={st.aiDailyQuota} onChange={(e) => set('aiDailyQuota', Number(e.target.value))} disabled={!st.aiEnabled} />
            </Field>
            <Field label="Lượt AI/ngày mỗi SV" htmlFor="q2">
              <Input id="q2" type="number" min={0} max={100} value={st.aiStudentDailyQuota} onChange={(e) => set('aiStudentDailyQuota', Number(e.target.value))} disabled={!st.aiEnabled} />
            </Field>
          </div>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Lưu thay đổi</Button>
      </div>
    </div>
  );
}
