import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SessionDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { invalidate } from '@/lib/query';

const today = () => new Date().toISOString().slice(0, 10);

export function SessionFormDialog({
  open,
  onOpenChange,
  classId,
  session,
  nextNumber,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  session?: SessionDoc | null;
  nextNumber: number;
}) {
  const [f, setF] = useState({ title: '', description: '', date: today(), plannedStart: '07:00', plannedEnd: '09:30', sessionNumber: nextNumber });
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (session) {
      setF({ title: session.title, description: session.description, date: session.date, plannedStart: session.plannedStart, plannedEnd: session.plannedEnd, sessionNumber: session.sessionNumber });
      setTopics(session.topics);
    } else {
      setF({ title: '', description: '', date: today(), plannedStart: '07:00', plannedEnd: '09:30', sessionNumber: nextNumber });
      setTopics([]);
    }
  }, [open, session, nextNumber]);

  const addTopic = () => {
    const t = topic.trim();
    if (t && !topics.includes(t)) setTopics((x) => [...x, t]);
    setTopic('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, topics, sessionNumber: Number(f.sessionNumber) };
      if (session) await api.patch(`/classes/${classId}/sessions/${session.sessionId}`, body);
      else await api.post(`/classes/${classId}/sessions`, body);
      await invalidate(`/classes/${classId}`);
      toast.success(session ? 'Đã cập nhật buổi học' : 'Đã tạo buổi học');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={session ? 'Sửa buổi học' : 'Tạo buổi học'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!f.title.trim()}>Lưu</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Buổi số" htmlFor="num">
          <Input id="num" type="number" min={1} value={f.sessionNumber} onChange={set('sessionNumber')} />
        </Field>
        <Field label="Tên buổi học" htmlFor="title" className="sm:col-span-3">
          <Input id="title" value={f.title} onChange={set('title')} placeholder="Mô hình kinh doanh nền tảng số" />
        </Field>
        <Field label="Ngày" htmlFor="date" className="sm:col-span-2">
          <Input id="date" type="date" value={f.date} onChange={set('date')} />
        </Field>
        <Field label="Bắt đầu" htmlFor="start">
          <Input id="start" type="time" value={f.plannedStart} onChange={set('plannedStart')} />
        </Field>
        <Field label="Kết thúc" htmlFor="end">
          <Input id="end" type="time" value={f.plannedEnd} onChange={set('plannedEnd')} />
        </Field>
        <Field label="Nội dung chính" htmlFor="desc" className="sm:col-span-4">
          <Textarea id="desc" value={f.description} onChange={set('description')} maxLength={3000} />
        </Field>
        <Field label="Chủ đề kiến thức" htmlFor="topic" hint="Sinh viên gắn chủ đề khi đặt câu hỏi. Nhấn Enter để thêm." className="sm:col-span-4">
          <div className="flex gap-2">
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTopic();
                }
              }}
              placeholder="VD: Revenue Models"
              maxLength={80}
            />
            <Button variant="outline" onClick={addTopic}>Thêm</Button>
          </div>
          {topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary-soft px-2 py-1 text-xs font-medium text-secondary">
                  #{t}
                  <button onClick={() => setTopics((x) => x.filter((y) => y !== t))} aria-label={`Bỏ chủ đề ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
