import { ArrowRightLeft, Check, KeyRound, MoreHorizontal, Search, ShieldCheck, Upload, UserMinus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ClassDoc, EnrollmentRequestDoc, MemberDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { useClassCtx } from './ClassLayout';
import { ImportRosterDialog } from './ImportRosterDialog';

interface Members {
  members: MemberDoc[];
  pendingRoster: { studentId: string; fullName: string; email: string | null }[];
}

export function StudentsPage() {
  const { t } = useTranslation();
  const { cls, access } = useClassCtx();
  const base = `/classes/${cls.classId}`;
  const members = useApi<Members>(`${base}/members`);
  const requests = useApi<{ items: EnrollmentRequestDoc[] }>(`${base}/enrollment-requests`);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'reset' | 'roster'; m?: MemberDoc; studentId?: string } | null>(null);
  const [moving, setMoving] = useState<MemberDoc | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (members.data?.members ?? []).filter((m) => !needle || `${m.studentId} ${m.displayName}`.toLowerCase().includes(needle));
  }, [members.data, q]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await invalidate(base, '/teach');
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const resetPassword = async (m: MemberDoc) => {
    setBusy(true);
    try {
      const r = await api.post<{ temporaryPassword: string }>(`/users/${m.uid}/reset-password`, {});
      setTempPw({ name: `${m.displayName} (${m.studentId})`, pw: r.temporaryPassword });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {(requests.data?.items.length ?? 0) > 0 && (
        <Card className="border-orange-200">
          <CardHeader title={t('Yêu cầu tham gia lớp')} description={t('Sinh viên chưa có trong danh sách xin vào lớp')} />
          <CardBody className="space-y-2">
            {requests.data!.items.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.displayName} <span className="font-mono text-xs text-muted">{r.studentId}</span></p>
                  {r.message && <p className="text-sm text-muted">“{r.message}”</p>}
                </div>
                {access.canManage && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => run(() => api.post(`${base}/enrollment-requests/${r.uid}/decide`, { approve: true }), t('Đã duyệt vào lớp'))}>
                      <Check className="h-4 w-4" /> {t('Duyệt')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => api.post(`${base}/enrollment-requests/${r.uid}/decide`, { approve: false }), t('Đã từ chối'))}>
                      <X className="h-4 w-4" /> {t('Từ chối')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader
          title={t('Sinh viên trong lớp ({{count}})', { count: members.data?.members.length ?? 0 })}
          description={t('Sinh viên đã đăng ký tài khoản và được gán vào lớp')}
          actions={
            access.canManage && (
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> {t('Nhập danh sách')}
              </Button>
            )
          }
        />
        <CardBody className="space-y-3 p-0 sm:p-0">
          <div className="px-4 pt-4 sm:px-5">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tìm mã SV, họ tên')} className="pl-9" aria-label={t('Tìm sinh viên')} />
            </div>
          </div>
          {members.isLoading ? (
            <div className="p-4"><ListSkeleton /></div>
          ) : members.error ? (
            <ErrorState error={members.error} />
          ) : !filtered.length ? (
            <EmptyState title={t('Chưa có sinh viên')} description={t('Nhập danh sách lớp từ file Excel/CSV. Sinh viên sẽ tự đăng ký bằng mã sinh viên.')} />
          ) : (
            <Table>
              <thead>
                <tr><Th>{t('STT')}</Th><Th>{t('Mã SV')}</Th><Th>{t('Họ tên')}</Th><Th>{t('Vai trò')}</Th><Th /></tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.uid} className="hover:bg-slate-50">
                    <Td className="text-muted">{i + 1}</Td>
                    <Td className="font-mono text-xs">{m.studentId}</Td>
                    <Td>
                      <Link to={`../analytics/students/${m.uid}`} className="hover:text-primary">{m.displayName}</Link>
                    </Td>
                    <Td>{m.role === 'ta' ? <Badge tone="secondary">{t('Trợ giảng')}</Badge> : <span className="text-sm text-muted">{t('Sinh viên', { context: 'n' })}</span>}</Td>
                    <Td className="text-right">
                      {access.canManage && (
                        <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label={t('Thao tác')} disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button>}>
                          <MenuItem onSelect={() => run(() => api.patch(`${base}/members/${m.uid}`, { role: m.role === 'ta' ? 'student' : 'ta' }), m.role === 'ta' ? t('Đã bỏ quyền trợ giảng') : t('Đã cấp quyền trợ giảng'))}>
                            <ShieldCheck className="h-4 w-4" /> {m.role === 'ta' ? t('Bỏ quyền trợ giảng') : t('Cấp quyền trợ giảng')}
                          </MenuItem>
                          <MenuItem onSelect={() => setConfirm({ kind: 'reset', m })}>
                            <KeyRound className="h-4 w-4" /> {t('Đặt lại mật khẩu')}
                          </MenuItem>
                          <MenuItem onSelect={() => setMoving(m)}>
                            <ArrowRightLeft className="h-4 w-4" /> {t('Chuyển sang lớp khác')}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem danger onSelect={() => setConfirm({ kind: 'remove', m })}>
                            <UserMinus className="h-4 w-4" /> {t('Xóa khỏi lớp')}
                          </MenuItem>
                        </Menu>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      {(members.data?.pendingRoster.length ?? 0) > 0 && (
        <Card>
          <CardHeader title={t('Chưa đăng ký tài khoản ({{count}})', { count: members.data!.pendingRoster.length })} description={t('Có trong danh sách lớp nhưng chưa tự đăng ký. Hãy nhắc sinh viên vào trang Đăng ký và nhập mã sinh viên.')} />
          <Table>
            <thead><tr><Th>{t('Mã SV')}</Th><Th>{t('Họ tên')}</Th><Th>Email</Th><Th /></tr></thead>
            <tbody>
              {members.data!.pendingRoster.map((r) => (
                <tr key={r.studentId}>
                  <Td className="font-mono text-xs">{r.studentId}</Td>
                  <Td>{r.fullName}</Td>
                  <Td className="text-muted">{r.email}</Td>
                  <Td className="text-right">
                    {access.canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'roster', studentId: r.studentId })}>{t('Bỏ khỏi danh sách')}</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <ImportRosterDialog open={importOpen} onOpenChange={setImportOpen} classId={cls.classId} />
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={t('Xóa sinh viên khỏi lớp?')}
        description={t('{{name}} sẽ không còn truy cập lớp. Dữ liệu tương tác đã có vẫn được giữ.', { name: confirm?.m?.displayName })}
        danger
        confirmLabel={t('Xóa khỏi lớp')}
        loading={busy}
        onConfirm={() => confirm?.m && run(() => api.del(`${base}/members/${confirm.m!.uid}`), t('Đã xóa khỏi lớp'))}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={t('Đặt lại mật khẩu?')}
        description={t('Hệ thống tạo mật khẩu tạm cho {{name}}. Sinh viên phải đổi mật khẩu khi đăng nhập lại; các phiên đang mở bị đăng xuất.', { name: confirm?.m?.displayName })}
        confirmLabel={t('Đặt lại')}
        loading={busy}
        onConfirm={() => confirm?.m && resetPassword(confirm.m)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'roster'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={t('Bỏ khỏi danh sách lớp?')}
        description={t('Mã {{studentId}} sẽ không được thêm vào lớp này khi đăng ký.', { studentId: confirm?.studentId })}
        danger
        loading={busy}
        onConfirm={() => confirm?.studentId && run(() => api.del(`${base}/roster/${confirm.studentId}`), t('Đã bỏ khỏi danh sách'))}
      />
      <Dialog open={!!tempPw} onOpenChange={(v) => !v && setTempPw(null)} title={t('Mật khẩu tạm thời')} size="sm" footer={<Button onClick={() => setTempPw(null)}>{t('Đã ghi lại')}</Button>}>
        <p className="text-sm">{tempPw?.name}</p>
        <p className="mt-3 select-all rounded-lg bg-surface-2 py-3 text-center font-mono text-2xl font-bold tracking-widest">{tempPw?.pw}</p>
        <Alert tone="warning">{t('Mật khẩu chỉ hiển thị một lần. Hãy đưa trực tiếp cho sinh viên.')}</Alert>
      </Dialog>
      <MoveDialog member={moving} onClose={() => setMoving(null)} from={cls} />
    </div>
  );
}

function MoveDialog({ member, onClose, from }: { member: MemberDoc | null; onClose: () => void; from: ClassDoc }) {
  const { t } = useTranslation();
  const classes = useApi<{ items: ClassDoc[] }>(member ? '/classes' : null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (classes.data?.items ?? []).filter((c) => c.classId !== from.classId && c.status === 'active');
  const move = async () => {
    if (!member) return;
    setBusy(true);
    try {
      await api.post(`/classes/${from.classId}/members/${member.uid}/move`, { toClassId: to });
      await invalidate(`/classes/${from.classId}`, `/classes/${to}`, '/teach');
      toast.success(t('Đã chuyển lớp'));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!member}
      onOpenChange={(v) => !v && onClose()}
      title={t('Chuyển sinh viên sang lớp khác')}
      description={member ? `${member.displayName} (${member.studentId})` : ''}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={move} loading={busy} disabled={!to}>{t('Chuyển lớp')}</Button>
        </>
      }
    >
      <Field label={t('Lớp đích')} htmlFor="to" hint={t('Chỉ hiển thị các lớp bạn phụ trách')}>
        <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">{t('— Chọn lớp —')}</option>
          {options.map((c) => (
            <option key={c.classId} value={c.classId}>{c.classCode} – {c.courseName} ({c.semester})</option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}
