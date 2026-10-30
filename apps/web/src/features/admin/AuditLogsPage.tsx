import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditLogDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { tk } from '@/i18n';
import { useApi } from '@/lib/query';
import { formatDateTime } from '@/lib/utils';

const ACTIONS: Record<string, string> = {
  'auth.register': tk('Đăng ký tài khoản'),
  'auth.locked': tk('Khóa tạm do đăng nhập sai'),
  'auth.change_password': tk('Đổi mật khẩu'),
  'user.create': tk('Tạo tài khoản'),
  'user.disable': tk('Khóa tài khoản'),
  'user.enable': tk('Mở khóa tài khoản'),
  'user.change_role': tk('Đổi vai trò'),
  'user.reset_password': tk('Đặt lại mật khẩu'),
  'user.update_profile': tk('Sửa hồ sơ'),
  'class.create': tk('Tạo lớp'),
  'class.update': tk('Sửa lớp'),
  'class.import_roster': tk('Nhập danh sách'),
  'class.add_members': tk('Thêm sinh viên'),
  'class.remove_member': tk('Xóa SV khỏi lớp'),
  'class.move_member': tk('Chuyển lớp'),
  'class.member_role': tk('Đổi vai trò trong lớp'),
  'class.approve_request': tk('Duyệt yêu cầu vào lớp'),
  'class.reject_request': tk('Từ chối yêu cầu vào lớp'),
  'class.export': tk('Xuất dữ liệu'),
  'session.start': tk('Bắt đầu buổi học'),
  'session.end': tk('Kết thúc buổi học'),
  'post.moderate': tk('Kiểm duyệt bài'),
  'post.reveal_author': tk('Xem danh tính bài ẩn danh'),
  'ai.answer': tk('Gọi AI'),
  'ai.publish': tk('Công bố câu trả lời AI'),
  'settings.ai_update': tk('Sửa cấu hình AI'),
  'setup.bootstrap': tk('Khởi tạo hệ thống'),
};

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const qs = new URLSearchParams({ limit: '50', ...(action ? { action } : {}), ...(cursor ? { cursor } : {}) });
  const { data, isLoading, error } = useApi<{ items: AuditLogDoc[]; nextCursor: string | null }>(`/admin/audit-logs?${qs}`);
  return (
    <div>
      <PageHeader title={t('Nhật ký thao tác')} description={t('Các thao tác quản trị và sự kiện bảo mật được ghi lại để kiểm tra.')} />
      <div className="mb-4">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setCursors([]); }} className="w-auto" aria-label={t('Loại thao tác')}>
          <option value="">{t('Mọi thao tác')}</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
      </div>
      <Card>
        {isLoading ? <div className="p-4"><ListSkeleton /></div> : error ? <ErrorState error={error} /> : !data?.items.length ? <EmptyState title={t('Không có bản ghi')} /> : (
          <Table>
            <thead><tr><Th>{t('Thời gian')}</Th><Th>{t('Người thực hiện')}</Th><Th>{t('Thao tác')}</Th><Th>{t('Đối tượng')}</Th><Th>{t('Chi tiết')}</Th><Th>IP</Th></tr></thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</Td>
                  <Td>{l.actorName || l.actorId}<span className="ml-1 text-xs text-muted">({l.actorRole})</span></Td>
                  <Td>{l.action in ACTIONS ? t(ACTIONS[l.action]!) : l.action}</Td>
                  <Td className="font-mono text-xs">{l.targetType}:{l.targetId.slice(0, 10)}</Td>
                  <Td className="max-w-xs truncate font-mono text-xs text-muted" >{JSON.stringify(l.details)}</Td>
                  <Td className="text-xs text-muted">{l.ip}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex justify-between border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>{t('Trang trước')}</Button>
          <Button variant="outline" size="sm" disabled={!data?.nextCursor} onClick={() => setCursors((c) => [...c, data!.nextCursor!])}>{t('Trang sau')}</Button>
        </div>
      </Card>
    </div>
  );
}
