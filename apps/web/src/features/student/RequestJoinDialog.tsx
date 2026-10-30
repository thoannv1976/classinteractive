import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export function RequestJoinDialog({ open, onOpenChange, classId, description }: { open: boolean; onOpenChange: (v: boolean) => void; classId?: string; description?: string }) {
  const { t } = useTranslation();
  const [classCode, setClassCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const send = async () => {
    setLoading(true);
    try {
      const r = await api.post<{ className: string }>('/enrollment-requests', classId ? { classId, message } : { classCode, message });
      toast.success(t('Đã gửi yêu cầu tham gia {{name}}. Vui lòng chờ giảng viên duyệt.', { name: r.className }));
      onOpenChange(false);
      setClassCode('');
      setMessage('');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Xin tham gia lớp học phần')}
      description={description ?? t('Nhập mã lớp học phần do giảng viên cung cấp (VD: DGB301.01).')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Hủy')}</Button>
          <Button onClick={send} loading={loading} disabled={!classId && !classCode.trim()}>{t('Gửi yêu cầu')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {!classId && (
          <Field label={t('Mã lớp học phần')} htmlFor="cc">
            <Input id="cc" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="DGB301.01" />
          </Field>
        )}
        <Field label={t('Lời nhắn (không bắt buộc)')} htmlFor="msg">
          <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={t('VD: Em học lại học phần này')} />
        </Field>
      </div>
    </Dialog>
  );
}
