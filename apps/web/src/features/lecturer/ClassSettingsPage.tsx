import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(t('Đã lưu cài đặt lớp'));
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
        <CardHeader title={t('Thông tin lớp')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Tên lớp')} htmlFor="n"><Input id="n" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></Field>
          <Field label={t('Lịch học')} htmlFor="s"><Input id="s" value={info.schedule} onChange={(e) => setInfo({ ...info, schedule: e.target.value })} /></Field>
          <Field label={t('Học kỳ')} htmlFor="sem"><Input id="sem" value={info.semester} onChange={(e) => setInfo({ ...info, semester: e.target.value })} /></Field>
          <Field label={t('Năm học')} htmlFor="ay"><Input id="ay" value={info.academicYear} onChange={(e) => setInfo({ ...info, academicYear: e.target.value })} /></Field>
          <Field label={t('Trạng thái lớp')} htmlFor="stt" hint={t('Lớp bị khóa: sinh viên chỉ xem, không gửi tương tác mới.')}>
            <Select id="stt" value={info.status} onChange={(e) => setInfo({ ...info, status: e.target.value as ClassStatus })}>
              {(Object.keys(CLASS_STATUS_LABELS) as ClassStatus[]).map((k) => <option key={k} value={k}>{t(CLASS_STATUS_LABELS[k])}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Tương tác')} />
        <CardBody className="space-y-4">
          <Switch id="anon" checked={st.allowAnonymous} onCheckedChange={(v) => set('allowAnonymous', v)} label={t('Cho phép đặt câu hỏi ẩn danh')} description={t('Tên sinh viên được ẩn với các bạn khác. Hệ thống vẫn ghi nhận để tính mức độ tham gia và chống lạm dụng.')} />
          <Switch id="reveal" checked={st.revealAnonymousToStaff} onCheckedChange={(v) => set('revealAnonymousToStaff', v)} label={t('Giảng viên được xem danh tính bài ẩn danh')} description={t('Sinh viên được thông báo rõ chính sách này khi gửi bài. Mỗi lần xem được ghi nhật ký.')} />
          <Field label={t('Thời gian cho phép sửa/xóa bài (phút)')} htmlFor="ew">
            <Input id="ew" type="number" min={0} max={1440} value={st.editWindowMinutes} onChange={(e) => set('editWindowMinutes', Number(e.target.value))} className="max-w-[140px]" />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Trợ lý AI')} description={t('AI chỉ là công cụ hỗ trợ; mặc định mọi câu trả lời AI cần giảng viên duyệt.')} />
        <CardBody className="space-y-4">
          <Switch id="ai" checked={st.aiEnabled} onCheckedChange={(v) => set('aiEnabled', v)} label={t('Bật AI cho lớp này')} />
          <Field label={t('Chế độ')} htmlFor="mode">
            <Select id="mode" value={st.aiMode} onChange={(e) => set('aiMode', e.target.value as ClassSettings['aiMode'])} disabled={!st.aiEnabled}>
              <option value="assistant">{t('AI Assistant – AI soạn nháp, giảng viên duyệt trước khi công bố (khuyến nghị)')}</option>
              <option value="student_support">{t('AI Student Support – sinh viên được hỏi AI cho câu hỏi của mình (có nhãn AI)')}</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('Nhà cung cấp')} htmlFor="prov">
              <Select id="prov" value={st.aiProvider ?? ''} onChange={(e) => set('aiProvider', (e.target.value || null) as AiProvider | null)} disabled={!st.aiEnabled}>
                <option value="">{t('Theo cấu hình hệ thống')}</option>
                <option value="anthropic">Claude</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </Select>
            </Field>
            <Field label={t('Lượt AI/ngày của lớp')} htmlFor="q1">
              <Input id="q1" type="number" min={0} value={st.aiDailyQuota} onChange={(e) => set('aiDailyQuota', Number(e.target.value))} disabled={!st.aiEnabled} />
            </Field>
            <Field label={t('Lượt AI/ngày mỗi SV')} htmlFor="q2">
              <Input id="q2" type="number" min={0} max={100} value={st.aiStudentDailyQuota} onChange={(e) => set('aiStudentDailyQuota', Number(e.target.value))} disabled={!st.aiEnabled} />
            </Field>
          </div>
          <Switch
            id="autoai"
            checked={st.autoAiOnSessionEnd ?? true}
            onCheckedChange={(v) => set('autoAiOnSessionEnd', v)}
            disabled={!st.aiEnabled}
            label={t('Tự động phân loại chủ đề, gom nhóm câu hỏi và tóm tắt khi kết thúc buổi học')}
            description={t('Bản tóm tắt AI luôn là bản nháp cho tới khi giảng viên duyệt.')}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('Điểm tham gia')} description={t('Điểm tham khảo tính từ các cơ hội tham gia thực tế; chỉ là điểm chính thức sau khi giảng viên xác nhận.')} />
        <CardBody>
          <Switch
            id="showscore"
            checked={!!st.showScoreToStudents}
            onCheckedChange={(v) => set('showScoreToStudents', v)}
            label={t('Cho sinh viên xem điểm tham khảo của mình')}
            description={t('Mỗi sinh viên chỉ xem được điểm của chính mình, kèm giải thích cách tính.')}
          />
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>{t('Lưu thay đổi')}</Button>
      </div>
    </div>
  );
}
