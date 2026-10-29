import { KeyRound, Lock, MoreHorizontal, Search, ShieldCheck, Unlock, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { UserDoc, UserRole, UserStatus } from '@classinteract/shared';
import { ROLE_LABELS, USER_STATUS_LABELS, canAssignRole } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { invalidate, useApi } from '@/lib/query';
import { formatDateTime, tempPasswordHint } from './util';

export function UsersPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState<UserRole | ''>((params.get('role') as UserRole) ?? '');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(params.get('new') === 'lecturer');
  const [confirm, setConfirm] = useState<{ u: UserDoc; kind: 'disable' | 'enable' | 'reset' } | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserDoc | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (params.get('new')) setParams({}, { replace: true });
  }, [params, setParams]);
  useEffect(() => setCursor(null), [role, status, search]);

  const qs = new URLSearchParams({ limit: '50', ...(role ? { role } : {}), ...(status ? { status } : {}), ...(search ? { q: search } : {}), ...(cursor ? { cursor } : {}) });
  const { data, isLoading, error, refetch } = useApi<{ items: UserDoc[]; nextCursor: string | null }>(`/users?${qs}`);

  const act = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'reset') {
        const r = await api.post<{ temporaryPassword: string }>(`/users/${confirm.u.uid}/reset-password`, {});
        setTempPw({ name: confirm.u.displayName, pw: r.temporaryPassword });
      } else {
        await api.patch(`/users/${confirm.u.uid}/status`, { status: confirm.kind === 'disable' ? 'disabled' : 'active' });
        toast.success(confirm.kind === 'disable' ? 'Đã khóa tài khoản và đăng xuất mọi phiên' : 'Đã mở khóa tài khoản');
      }
      await invalidate('/users', '/admin');
      setConfirm(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Sinh viên tự đăng ký bằng mã sinh viên có trong danh sách lớp. Tài khoản giảng viên/quản trị do quản trị viên tạo."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" /> Tạo tài khoản cán bộ
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <form
          className="relative w-full max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setSearch(q.trim())} placeholder="Mã SV, họ tên hoặc email – Enter để tìm" className="pl-9" aria-label="Tìm người dùng" />
        </form>
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole | '')} className="w-auto" aria-label="Vai trò">
          <option value="">Mọi vai trò</option>
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as UserStatus | '')} className="w-auto" aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="disabled">Đã khóa</option>
        </Select>
      </div>
      <Card>
        {isLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <EmptyState title="Không có người dùng phù hợp" />
        ) : (
          <Table>
            <thead>
              <tr><Th>Họ tên</Th><Th>Mã SV / Email</Th><Th>Vai trò</Th><Th>Trạng thái</Th><Th>Đăng nhập gần nhất</Th><Th /></tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50">
                  <Td><Link to={`/admin/users/${u.uid}`} className="font-medium hover:text-primary">{u.displayName}</Link></Td>
                  <Td className="font-mono text-xs">{u.studentId ?? u.email}</Td>
                  <Td><Badge tone={u.role === 'student' ? 'neutral' : u.role === 'lecturer' ? 'secondary' : 'primary'}>{ROLE_LABELS[u.role]}</Badge></Td>
                  <Td><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{USER_STATUS_LABELS[u.status]}</Badge>{u.mustChangePassword && <Badge tone="warning" className="ml-1">MK tạm</Badge>}</Td>
                  <Td className="text-xs text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</Td>
                  <Td className="text-right">
                    {u.uid !== me.uid && (
                      <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label="Thao tác"><MoreHorizontal className="h-4 w-4" /></Button>}>
                        {u.status === 'active' ? (
                          <MenuItem danger onSelect={() => setConfirm({ u, kind: 'disable' })}><Lock className="h-4 w-4" /> Khóa tài khoản</MenuItem>
                        ) : (
                          <MenuItem onSelect={() => setConfirm({ u, kind: 'enable' })}><Unlock className="h-4 w-4" /> Mở khóa</MenuItem>
                        )}
                        <MenuItem onSelect={() => setConfirm({ u, kind: 'reset' })}><KeyRound className="h-4 w-4" /> Đặt lại mật khẩu</MenuItem>
                        {u.role !== 'student' && canAssignRole(me.role, u.role) && (
                          <>
                            <MenuSeparator />
                            <MenuItem onSelect={() => setRoleTarget(u)}><ShieldCheck className="h-4 w-4" /> Đổi vai trò</MenuItem>
                          </>
                        )}
                      </Menu>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(data?.nextCursor || cursor) && (
          <div className="flex justify-between border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" disabled={!cursor} onClick={() => setCursor(null)}>Về đầu danh sách</Button>
            <Button variant="outline" size="sm" disabled={!data?.nextCursor} onClick={() => setCursor(data!.nextCursor)}>Trang sau</Button>
          </div>
        )}
      </Card>
      <CreateStaffDialog open={creating} onOpenChange={setCreating} />
      <RoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.kind === 'disable' ? 'Khóa tài khoản?' : confirm?.kind === 'enable' ? 'Mở khóa tài khoản?' : 'Đặt lại mật khẩu?'}
        description={
          confirm?.kind === 'disable'
            ? `${confirm.u.displayName} sẽ không thể đăng nhập và mọi phiên đang mở bị chặn ngay lập tức.`
            : confirm?.kind === 'reset'
              ? `Tạo mật khẩu tạm cho ${confirm.u.displayName}. Người dùng phải đổi mật khẩu ở lần đăng nhập tiếp theo.`
              : `${confirm?.u.displayName} có thể đăng nhập lại.`
        }
        danger={confirm?.kind === 'disable'}
        loading={busy}
        onConfirm={act}
      />
      <Dialog open={!!tempPw} onOpenChange={(v) => !v && setTempPw(null)} title="Mật khẩu tạm thời" size="sm" footer={<Button onClick={() => setTempPw(null)}>Đã ghi lại</Button>}>
        <p className="text-sm">{tempPw?.name}</p>
        <p className="my-3 select-all rounded-lg bg-surface-2 py-3 text-center font-mono text-2xl font-bold tracking-widest">{tempPw?.pw}</p>
        <Alert tone="warning">{tempPasswordHint}</Alert>
      </Dialog>
    </div>
  );
}

function CreateStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useMe();
  const [f, setF] = useState({ email: '', displayName: '', role: 'lecturer' as 'lecturer' | 'admin', password: '' });
  const [busy, setBusy] = useState(false);
  const genPw = () => setF((x) => ({ ...x, password: Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6).toUpperCase() + '!' }));
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/users', f);
      await invalidate('/users', '/admin');
      toast.success('Đã tạo tài khoản. Hãy gửi email và mật khẩu tạm cho người dùng.');
      onOpenChange(false);
      setF({ email: '', displayName: '', role: 'lecturer', password: '' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tạo tài khoản cán bộ"
      description="Giảng viên/quản trị đăng nhập bằng email và phải đổi mật khẩu ở lần đầu."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button onClick={save} loading={busy} disabled={!f.email || !f.displayName || f.password.length < 6}>Tạo tài khoản</Button></>}
    >
      <div className="space-y-4">
        <Field label="Họ tên" htmlFor="dn"><Input id="dn" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="TS. Nguyễn Văn An" /></Field>
        <Field label="Email đăng nhập" htmlFor="em"><Input id="em" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="an.nv@truong.edu.vn" /></Field>
        <Field label="Vai trò" htmlFor="rl">
          <Select id="rl" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'lecturer' | 'admin' })}>
            <option value="lecturer">Giảng viên</option>
            {canAssignRole(me.role, 'admin') && <option value="admin">Quản trị</option>}
          </Select>
        </Field>
        <Field label="Mật khẩu tạm" htmlFor="pw" hint="Tối thiểu 6 ký tự">
          <div className="flex gap-2">
            <Input id="pw" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" />
            <Button variant="outline" onClick={genPw}>Tạo ngẫu nhiên</Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function RoleDialog({ user, onClose }: { user: UserDoc | null; onClose: () => void }) {
  const me = useMe();
  const [role, setRole] = useState<UserRole>('lecturer');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);
  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await api.patch(`/users/${user.uid}/role`, { role });
      await invalidate('/users');
      toast.success('Đã đổi vai trò');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()} title="Đổi vai trò" description={user?.displayName} size="sm" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={save} loading={busy}>Lưu</Button></>}>
      <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} aria-label="Vai trò">
        {(['lecturer', 'admin', 'superadmin'] as UserRole[]).filter((r) => canAssignRole(me.role, r)).map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </Select>
    </Dialog>
  );
}
