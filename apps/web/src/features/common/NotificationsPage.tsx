import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Bell, CheckCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { NotificationDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ListSkeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/firestore';
import { cn, timeAgo } from '@/lib/utils';

export function NotificationsPage() {
  const me = useMe();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useMemo(() => query(collection(db, 'users', me.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100)), [me.uid]);
  const { data, loading } = useLiveQuery<NotificationDoc>(q);
  const unread = data.filter((n) => !n.read).length;
  const open = (n: NotificationDoc) => {
    if (!n.read) void api.post('/notifications/read', { ids: [n.id] });
    if (n.link) {
      const link = me.role !== 'student' ? n.link.replace(/^\/classes\/([^/]+)\/sessions\/([^/?]+)/, '/teach/classes/$1/sessions/$2') : n.link;
      navigate(link);
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('Thông báo')}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => api.post('/notifications/read', {})}>
              <CheckCheck className="h-4 w-4" /> {t('Đánh dấu đã đọc tất cả')}
            </Button>
          )
        }
      />
      <Card>
        {loading ? (
          <div className="p-4"><ListSkeleton rows={3} /></div>
        ) : !data.length ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title={t('Chưa có thông báo')} description={t('Bạn sẽ nhận thông báo khi buổi học bắt đầu, có hoạt động mới hoặc câu hỏi được trả lời.')} />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5', !n.read && 'bg-primary-soft/40')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn('block text-sm', !n.read && 'font-semibold')}>{n.titleKey ? t(n.titleKey, n.titleParams ?? {}) : n.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-sm text-muted">{n.bodyKey ? t(n.bodyKey, n.bodyParams ?? {}) : n.body}</span>
                    <span className="mt-1 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
