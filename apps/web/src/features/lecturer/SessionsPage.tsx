import { CalendarPlus, MonitorPlay, MoreHorizontal, Pencil, Play, Archive, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { SessionDoc, SessionStatsDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Table, Td, Th } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { SessionStatusBadge, sessionTime } from '../common/SessionStatus';
import { useClassCtx } from './ClassLayout';
import { SessionFormDialog } from './SessionFormDialog';

type Row = SessionDoc & { stats: SessionStatsDoc | null };

export function SessionsPage() {
  const { cls, access } = useClassCtx();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useApi<{ items: Row[] }>(`/classes/${cls.classId}/sessions`);
  const [editing, setEditing] = useState<SessionDoc | null | undefined>(undefined);
  const items = data?.items ?? [];
  const next = Math.max(0, ...items.map((s) => s.sessionNumber)) + 1;

  const act = async (s: SessionDoc, action: 'start' | 'archive' | 'delete') => {
    try {
      if (action === 'delete') await api.del(`/classes/${cls.classId}/sessions/${s.sessionId}`);
      else await api.post(`/classes/${cls.classId}/sessions/${s.sessionId}/${action}`);
      await invalidate(`/classes/${cls.classId}`);
      if (action === 'start') navigate(`${s.sessionId}`);
      else toast.success(action === 'archive' ? 'Đã lưu trữ' : 'Đã xóa');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      {access.canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing(null)}>
            <CalendarPlus className="h-4 w-4" /> Tạo buổi học
          </Button>
        </div>
      )}
      <Card>
        {isLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !items.length ? (
          <EmptyState title="Chưa có buổi học" description="Tạo buổi học, sau đó bấm Bắt đầu để sinh viên tham gia bằng mã hoặc QR." action={access.canManage && <Button onClick={() => setEditing(null)}>Tạo buổi học đầu tiên</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Buổi</Th>
                <Th>Tên buổi học</Th>
                <Th>Thời gian</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">SV tham gia</Th>
                <Th className="text-right">Câu hỏi</Th>
                <Th className="text-right">Trả lời</Th>
                <Th className="text-right">Hoạt động</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.sessionId} className="hover:bg-slate-50">
                  <Td className="tabular-nums">{s.sessionNumber}</Td>
                  <Td>
                    <Link to={s.sessionId} className="font-medium hover:text-primary">{s.title}</Link>
                    {s.topics.length > 0 && <p className="mt-0.5 max-w-xs truncate text-xs text-muted">{s.topics.map((t) => '#' + t).join(' ')}</p>}
                  </Td>
                  <Td className="text-muted">{sessionTime(s)}</Td>
                  <Td><SessionStatusBadge status={s.status} /></Td>
                  <Td className="text-right tabular-nums">{s.stats?.attendeeCount ?? 0}</Td>
                  <Td className="text-right tabular-nums">{s.stats?.questionCount ?? 0}</Td>
                  <Td className="text-right tabular-nums">{s.stats?.answerCount ?? 0}</Td>
                  <Td className="text-right tabular-nums">{s.stats?.activityCount ?? 0}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {access.canManage && (s.status === 'draft' || s.status === 'closed') ? (
                        <Button size="sm" variant={s.status === 'draft' ? 'primary' : 'outline'} onClick={() => act(s, 'start')}>
                          <Play className="h-4 w-4" /> {s.status === 'draft' ? 'Bắt đầu' : 'Mở lại'}
                        </Button>
                      ) : (
                        <Link to={s.sessionId} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary-soft px-3 text-xs font-medium text-primary">
                          <MonitorPlay className="h-4 w-4" /> Điều hành
                        </Link>
                      )}
                      {access.canManage && (
                        <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label="Thêm"><MoreHorizontal className="h-4 w-4" /></Button>}>
                          <MenuItem onSelect={() => navigate(s.sessionId)}><MonitorPlay className="h-4 w-4" /> Mở trang điều hành</MenuItem>
                          <MenuItem onSelect={() => setEditing(s)}><Pencil className="h-4 w-4" /> Sửa thông tin</MenuItem>
                          {s.status === 'closed' && <MenuItem onSelect={() => act(s, 'archive')}><Archive className="h-4 w-4" /> Lưu trữ</MenuItem>}
                          {s.status === 'draft' && !s.startedAt && <MenuItem danger onSelect={() => act(s, 'delete')}><Trash2 className="h-4 w-4" /> Xóa</MenuItem>}
                        </Menu>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <SessionFormDialog open={editing !== undefined} onOpenChange={(v) => !v && setEditing(undefined)} classId={cls.classId} session={editing} nextNumber={next} />
    </div>
  );
}
