import { useState } from 'react';
import type { AuditLogDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { formatDateTime } from '@/lib/utils';

const ACTIONS: Record<string, string> = {
  'auth.register': 'Đăng ký tài khoản',
  'auth.locked': 'Khóa tạm do đăng nhập sai',
  'auth.change_password': 'Đổi mật khẩu',
  'user.create': 'Tạo tài khoản',
  'user.disable': 'Khóa tài khoản',
  'user.enable': 'Mở khóa tài khoản',
  'user.change_role': 'Đổi vai trò',
  'user.reset_password': 'Đặt lại mật khẩu',
  'user.update_profile': 'Sửa hồ sơ',
  'class.create': 'Tạo lớp',
  'class.update': 'Sửa lớp',
  'class.import_roster': 'Nhập danh sách',
  'class.add_members': 'Thêm sinh viên',
  'class.remove_member': 'Xóa SV khỏi lớp',
  'class.move_member': 'Chuyển lớp',
  'class.member_role': 'Đổi vai trò trong lớp',
  'class.approve_request': 'Duyệt yêu cầu vào lớp',
  'class.reject_request': 'Từ chối yêu cầu vào lớp',
  'class.export': 'Xuất dữ liệu',
  'session.start': 'Bắt đầu buổi học',
  'session.end': 'Kết thúc buổi học',
  'post.moderate': 'Kiểm duyệt bài',
  'post.reveal_author': 'Xem danh tính bài ẩn danh',
  'ai.answer': 'Gọi AI',
  'ai.publish': 'Công bố câu trả lời AI',
  'settings.ai_update': 'Sửa cấu hình AI',
  'setup.bootstrap': 'Khởi tạo hệ thống',
};

export function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const qs = new URLSearchParams({ limit: '50', ...(action ? { action } : {}), ...(cursor ? { cursor } : {}) });
  const { data, isLoading, error } = useApi<{ items: AuditLogDoc[]; nextCursor: string | null }>(`/admin/audit-logs?${qs}`);
  return (
    <div>
      <PageHeader title="Nhật ký thao tác" description="Các thao tác quản trị và sự kiện bảo mật được ghi lại để kiểm tra." />
      <div className="mb-4">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setCursors([]); }} className="w-auto" aria-label="Loại thao tác">
          <option value="">Mọi thao tác</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Card>
        {isLoading ? <div className="p-4"><ListSkeleton /></div> : error ? <ErrorState error={error} /> : !data?.items.length ? <EmptyState title="Không có bản ghi" /> : (
          <Table>
            <thead><tr><Th>Thời gian</Th><Th>Người thực hiện</Th><Th>Thao tác</Th><Th>Đối tượng</Th><Th>Chi tiết</Th><Th>IP</Th></tr></thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</Td>
                  <Td>{l.actorName || l.actorId}<span className="ml-1 text-xs text-muted">({l.actorRole})</span></Td>
                  <Td>{ACTIONS[l.action] ?? l.action}</Td>
                  <Td className="font-mono text-xs">{l.targetType}:{l.targetId.slice(0, 10)}</Td>
                  <Td className="max-w-xs truncate font-mono text-xs text-muted" >{JSON.stringify(l.details)}</Td>
                  <Td className="text-xs text-muted">{l.ip}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex justify-between border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>Trang trước</Button>
          <Button variant="outline" size="sm" disabled={!data?.nextCursor} onClick={() => setCursors((c) => [...c, data!.nextCursor!])}>Trang sau</Button>
        </div>
      </Card>
    </div>
  );
}
