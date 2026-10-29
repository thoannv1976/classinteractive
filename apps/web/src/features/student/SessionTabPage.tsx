import { Radio } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/query';
import { JoinByCode } from './JoinByCode';
import { LiveSessionList, type LiveItem } from './StudentHome';

/** "Buổi học" tab: running sessions + join by code. Also handles /join/:code from QR codes. */
export function SessionTabPage() {
  const { code } = useParams();
  const live = useApi<{ items: LiveItem[] }>('/me/live-sessions', { refetchInterval: 20_000 });
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (code) formRef.current?.querySelector('form')?.requestSubmit();
  }, [code]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Tham gia buổi học" description="Chọn buổi đang diễn ra hoặc nhập mã/quét QR do giảng viên trình chiếu." />
      <Card>
        <CardHeader title="Nhập mã tham gia" />
        <CardBody>
          <div ref={formRef}>
            <JoinByCode initialCode={code?.toUpperCase() ?? ''} />
          </div>
          <p className="mt-2 text-xs text-muted">Mã chỉ giúp tìm đúng buổi học. Bạn vẫn cần có tên trong danh sách lớp.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Đang diễn ra trong các lớp của bạn" />
        <CardBody>
          {live.isLoading ? (
            <ListSkeleton rows={1} />
          ) : live.data?.items.length ? (
            <LiveSessionList items={live.data.items} />
          ) : (
            <EmptyState icon={<Radio className="h-6 w-6" />} title="Chưa có buổi học nào đang mở" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
