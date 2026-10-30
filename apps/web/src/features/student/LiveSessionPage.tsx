import { Activity, MessageCircleQuestion, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ActivityDoc, ClassDoc, PostDoc, SessionDoc, SessionStatsDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, ListSkeleton, Spinner } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NoActivities, StudentActivityCard } from '@/components/classroom/Activities';
import { Composer } from '@/components/classroom/Composer';
import { PostCard } from '@/components/classroom/PostCard';
import { PublishedSummary } from '@/components/classroom/SessionSummary';
import { sessionPath, sortPosts, useActivities, useFeed } from '@/components/classroom/hooks';
import { api, errorMessage } from '@/lib/api';
import { useLiveDoc } from '@/lib/firestore';
import { useApi } from '@/lib/query';
import { toDate } from '@/lib/utils';
import i18n from '@/i18n';
import { SessionStatusBadge, sessionLabel, sessionTime } from '../common/SessionStatus';

export function acceptsPosts(s: SessionDoc | null) {
  if (!s) return { ok: false, reason: '' };
  if (s.status === 'open') return { ok: true, reason: '' };
  if (s.status === 'paused') return { ok: false, reason: i18n.t('Buổi học đang tạm dừng') };
  if (s.status === 'closed') {
    const until = toDate(s.lateRepliesUntil);
    if (until && until.getTime() > Date.now()) return { ok: true, reason: '' };
    return { ok: false, reason: i18n.t('Buổi học đã kết thúc') };
  }
  return { ok: false, reason: i18n.t('Buổi học chưa bắt đầu') };
}

export function StudentSessionPage() {
  const { classId = '', sessionId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tab = params.get('tab') ?? 'qa';
  const meta = useApi<{ class: ClassDoc; joined: boolean; access: { canModerate: boolean; canManage: boolean } }>(`/classes/${classId}/sessions/${sessionId}`);
  const session = useLiveDoc<SessionDoc>(sessionPath(classId, sessionId));
  const stats = useLiveDoc<SessionStatsDoc>(`${sessionPath(classId, sessionId)}/stats/summary`);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const feed = useFeed(classId, sessionId, false, pageSize);
  const acts = useActivities(classId, sessionId, false);
  const cls = meta.data?.class;
  const s = session.data;
  const accept = acceptsPosts(s);

  // Staff opening a student link: go to the control view.
  useEffect(() => {
    if (meta.data?.access.canModerate) navigate(`/teach/classes/${classId}/sessions/${sessionId}`, { replace: true });
  }, [meta.data, classId, sessionId, navigate]);

  // Record attendance when the student opens a running session.
  useEffect(() => {
    if (meta.data && !meta.data.joined && s && (s.status === 'open' || s.status === 'paused')) {
      api.post(`/classes/${classId}/sessions/${sessionId}/join`).catch(() => undefined);
    }
  }, [meta.data, s, classId, sessionId]);

  const openActivities = acts.data.filter((a: ActivityDoc) => a.status === 'open').length;
  const posts = useMemo(() => sortPosts(feed.data, sort), [feed.data, sort]);
  const studentAi = !!cls && cls.settings.aiEnabled && cls.settings.aiMode === 'student_support';

  const askAiAsStudent = async (p: PostDoc) => {
    try {
      toast.info(t('AI đang soạn câu trả lời…'));
      await api.post('/ai/answer', { classId, sessionId, postId: p.postId });
      toast.success(t('AI đã trả lời câu hỏi của bạn (có nhãn AI Generated)'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (meta.error) return <ErrorState error={meta.error} />;
  if (!s || !cls) return session.loading || meta.isLoading ? <Spinner /> : <EmptyState title={t('Không tìm thấy buổi học')} />;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <PageHeader
          back={{ to: `/classes/${classId}`, label: `${cls.classCode} · ${cls.courseName}` }}
          title={sessionLabel(s)}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <SessionStatusBadge status={s.status} /> {sessionTime(s)}
            </span>
          }
        />
        {!accept.ok && accept.reason && (
          <div className="mb-4">
            <Alert tone={s.status === 'paused' ? 'warning' : 'info'}>{accept.reason}. {t('Bạn vẫn có thể xem lại nội dung.')}</Alert>
          </div>
        )}
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList className="mb-4">
            <TabsTrigger value="qa">
              <MessageCircleQuestion className="h-4 w-4" /> {t('Hỏi đáp')}
            </TabsTrigger>
            <TabsTrigger value="activities">
              <Activity className="h-4 w-4" /> {t('Hoạt động', { context: 'activity' })} {openActivities > 0 && <Badge tone="accent">{openActivities}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="qa" className="space-y-4">
            {/* Remount on status change so the listener re-subscribes when the session ends. */}
            <PublishedSummary key={s.status} classId={classId} sessionId={sessionId} />
            <Composer
              classId={classId}
              sessionId={sessionId}
              topics={s.topics}
              allowAnonymous={cls.settings.allowAnonymous}
              revealToStaff={cls.settings.revealAnonymousToStaff}
              disabled={s.status !== 'open'}
              disabledReason={accept.reason || t('Buổi học đã kết thúc, chỉ có thể trả lời bổ sung')}
              existing={feed.data}
            />
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{t('{{n}} bài đăng', { n: feed.data.length })}</p>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                {(['new', 'top'] as const).map((m) => (
                  <button key={m} onClick={() => setSort(m)} aria-pressed={sort === m} className={`rounded-md px-2.5 py-1 font-medium ${sort === m ? 'bg-surface shadow-sm' : 'text-muted'}`}>
                    {m === 'new' ? t('Mới nhất') : t('Được quan tâm')}
                  </button>
                ))}
              </div>
            </div>
            {feed.loading ? (
              <ListSkeleton rows={3} />
            ) : feed.error ? (
              <ErrorState error={feed.error} />
            ) : !posts.length ? (
              <EmptyState title={t('Chưa có câu hỏi nào')} description={t('Hãy là người đầu tiên đặt câu hỏi cho buổi học này.')} />
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <PostCard
                    key={p.postId}
                    post={p}
                    classId={classId}
                    sessionId={sessionId}
                    staff={false}
                    editWindowMinutes={cls.settings.editWindowMinutes}
                    onOpenThread={() => navigate(`/classes/${classId}/sessions/${sessionId}/posts/${p.postId}`)}
                    canAskAiAsStudent={studentAi}
                    onAskAi={studentAi ? askAiAsStudent : undefined}
                  />
                ))}
                {feed.data.length >= pageSize && (
                  <Button variant="outline" className="w-full" onClick={() => setPageSize((n) => n + 30)}>
                    {t('Xem thêm bài cũ hơn')}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="activities" className="space-y-4">
            {acts.loading ? (
              <ListSkeleton rows={2} />
            ) : !acts.data.length ? (
              <NoActivities staff={false} />
            ) : (
              acts.data.map((a) => <StudentActivityCard key={a.activityId} classId={classId} sessionId={sessionId} activity={a} canSubmit={s.status === 'open'} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
      <aside className="hidden space-y-4 xl:block">
        <Card>
          <CardBody className="space-y-3 text-sm">
            <p className="font-semibold">{t('Thông tin buổi học')}</p>
            {s.description && <p className="whitespace-pre-wrap text-muted">{s.description}</p>}
            {s.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.topics.map((tp) => (
                  <span key={tp} className="rounded-md bg-secondary-soft px-2 py-0.5 text-xs font-medium text-secondary">#{tp}</span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Mini label={t('Đang tham gia')} value={stats.data?.attendeeCount ?? 0} icon={<Users className="h-4 w-4" />} />
              <Mini label={t('Câu hỏi', { context: 'n' })} value={stats.data?.questionCount ?? 0} />
              <Mini label={t('Trả lời', { context: 'n' })} value={stats.data?.answerCount ?? 0} />
              <Mini label={t('Chưa giải đáp')} value={stats.data?.openQuestionCount ?? 0} />
            </div>
          </CardBody>
        </Card>
        {cls.settings.allowAnonymous && (
          <Alert tone="info" title={t('Câu hỏi ẩn danh')}>
            {t('Bạn có thể gửi ẩn danh với các bạn cùng lớp.')}{' '}
            {cls.settings.revealAnonymousToStaff ? t('Giảng viên vẫn có thể xem danh tính theo chính sách lớp.') : t('Giảng viên cũng không thấy tên bạn trên bảng tin.')} {t('Hệ thống vẫn ghi nhận đóng góp vào mức độ tham gia của bạn.')}
          </Alert>
        )}
      </aside>
    </div>
  );
}

function Mini({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <p className="flex items-center gap-1 text-xs text-muted">{icon}{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
