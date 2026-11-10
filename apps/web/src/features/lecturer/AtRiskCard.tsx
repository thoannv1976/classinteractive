import { BellRing, Download, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/misc';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/query';

type Reason = 'never_joined' | 'no_contribution' | 'absent_recent';

interface AtRiskData {
  sessionsHeld: number;
  recent: number;
  items: Array<{ uid: string; studentId: string | null; displayName: string; reasons: Reason[]; sessionsJoined: number; lastJoinedSession: number | null; score: number | null }>;
}

const REASON_LABEL: Record<Reason, string> = {
  never_joined: tk('Chưa vào buổi nào'),
  absent_recent: tk('Vắng các buổi gần đây'),
  no_contribution: tk('Có vào nhưng chưa đóng góp'),
};

/**
 * Early warning for the lecturer: students who never joined a session, missed the last sessions
 * or never contributed – with an in-app reminder and a CSV export.
 */
export function AtRiskCard({ classId, classCode, canManage }: { classId: string; classCode: string; canManage: boolean }) {
  const { t } = useTranslation();
  const { data } = useApi<AtRiskData>(`/classes/${classId}/at-risk`);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const items = useMemo(() => data?.items ?? [], [data]);
  if (!data || data.sessionsHeld === 0) return null;

  const visible = showAll ? items : items.slice(0, 10);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.uid));
  const toggle = (uid: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(uid)) n.delete(uid);
    else n.add(uid);
    return n;
  });

  const exportCsv = () => {
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [t('Mã SV'), t('Họ tên'), t('Lý do'), t('Số buổi đã vào'), t('Buổi gần nhất có mặt'), t('Điểm')],
      ...items.map((i) => [i.studentId, i.displayName, i.reasons.map((r) => t(REASON_LABEL[r])).join('; '), i.sessionsJoined, i.lastJoinedSession, i.score]),
    ];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${classCode}-can-chu-y.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-warning" /> {t('Sinh viên cần chú ý')} <Badge tone={items.length ? 'warning' : 'success'}>{items.length}</Badge>
          </span>
        }
        description={t('Chưa vào buổi nào, vắng {{n}} buổi gần nhất, hoặc có vào nhưng chưa có đóng góp nào. Không gồm tài khoản đã đánh dấu "Không tính điểm".', { n: data.recent })}
        actions={
          items.length > 0 && (
            <>
              <Button variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4" /> {t('Tải CSV')}
              </Button>
              {canManage && (
                <Button onClick={() => setOpen(true)} disabled={!selected.size}>
                  <BellRing className="h-4 w-4" /> {t('Gửi nhắc nhở ({{n}})', { n: selected.size })}
                </Button>
              )}
            </>
          )
        }
      />
      {!items.length ? (
        <CardBody>
          <p className="text-sm text-success">{t('Tất cả sinh viên đều đang tham gia. Tuyệt vời!')}</p>
        </CardBody>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                {canManage && (
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      aria-label={t('Chọn tất cả')}
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.uid)))}
                    />
                  </Th>
                )}
                <Th>{t('Mã SV')}</Th>
                <Th>{t('Họ tên')}</Th>
                <Th>{t('Lý do')}</Th>
                <Th className="text-right">{t('Số buổi đã vào')}</Th>
                <Th className="text-right">{t('Điểm')}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.uid}>
                  {canManage && (
                    <Td>
                      <input type="checkbox" aria-label={t('Chọn {{name}}', { name: i.displayName })} checked={selected.has(i.uid)} onChange={() => toggle(i.uid)} />
                    </Td>
                  )}
                  <Td className="font-mono text-xs">{i.studentId ?? '—'}</Td>
                  <Td>
                    <Link to={`/teach/classes/${classId}/analytics/students/${i.uid}?from=scores`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {i.displayName}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {i.reasons.map((r) => (
                        <Badge key={r} tone={r === 'never_joined' ? 'danger' : 'warning'}>{t(REASON_LABEL[r])}</Badge>
                      ))}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {i.sessionsJoined}/{data.sessionsHeld}
                  </Td>
                  <Td className="text-right tabular-nums">{i.score === null ? '—' : i.score.toFixed(1)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {items.length > 10 && (
            <CardBody className="pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? t('Thu gọn') : t('Xem tất cả {{n}} sinh viên', { n: items.length })}
              </Button>
            </CardBody>
          )}
        </>
      )}
      {open && <ReminderDialog classId={classId} uids={[...selected]} onClose={(sent) => { setOpen(false); if (sent) setSelected(new Set()); }} />}
    </Card>
  );
}

function ReminderDialog({ classId, uids, onClose }: { classId: string; uids: string[]; onClose: (sent: boolean) => void }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      const r = await api.post<{ sent: number }>(`/classes/${classId}/reminders`, { uids, message: message.trim() });
      toast.success(t('Đã gửi nhắc nhở cho {{n}} sinh viên', { n: r.sent }));
      onClose(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose(false)}
      title={t('Gửi nhắc nhở')}
      description={t('{{n}} sinh viên sẽ nhận thông báo trong ClassInteract (biểu tượng chuông).', { n: uids.length })}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose(false)}>{t('Hủy')}</Button>
          <Button onClick={() => void send()} loading={sending}>{t('Gửi')}</Button>
        </>
      }
    >
      <Field label={t('Lời nhắn (không bắt buộc)')} htmlFor="reminder-msg" hint={t('Để trống để dùng lời nhắn mặc định: nhắc vào buổi, đặt câu hỏi, trả lời và làm hoạt động.')}>
        <Textarea id="reminder-msg" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
      </Field>
    </Dialog>
  );
}
