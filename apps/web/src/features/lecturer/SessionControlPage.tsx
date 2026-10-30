import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { Activity, FileText, Maximize2, MessageCircleQuestion, Pause, Play, Plus, RefreshCw, Square, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { AttendanceDoc, ClassDoc, PostDoc, SessionDoc, SessionStatsDoc, StudentSessionMetricsDoc } from '@classinteract/shared';
import { ActivityCreator, NoActivities, StaffActivityCard } from '@/components/classroom/Activities';
import { AiDraftDialog } from '@/components/classroom/AiDraftDialog';
import { Composer } from '@/components/classroom/Composer';
import { PostCard } from '@/components/classroom/PostCard';
import { SessionSummaryEditor } from '@/components/classroom/SessionSummary';
import { sessionPath, sortPosts, useActivities, useFeed } from '@/components/classroom/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, ListSkeleton, Spinner } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/input';
import { PageHeader, Table, Td, Th } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { db } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/firestore';
import { invalidate, useApi } from '@/lib/query';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { SessionStatusBadge, sessionLabel, sessionTime } from '../common/SessionStatus';

type Filter = 'all' | 'open' | 'pinned' | 'hidden';

export const joinUrl = (code: string) => `${location.origin}/join/${code}`;

export function SessionControlPage() {
  const { t } = useTranslation();
  const { classId = '', sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'feed';
  const meta = useApi<{ class: ClassDoc; access: { canManage: boolean; canModerate: boolean } }>(`/classes/${classId}/sessions/${sessionId}`);
  const session = useLiveDoc<SessionDoc>(sessionPath(classId, sessionId));
  const stats = useLiveDoc<SessionStatsDoc>(`${sessionPath(classId, sessionId)}/stats/summary`);
  const [pageSize, setPageSize] = useState(50);
  const feed = useFeed(classId, sessionId, true, pageSize);
  const acts = useActivities(classId, sessionId, true);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const [aiPost, setAiPost] = useState<PostDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = session.data;
  const cls = meta.data?.class;

  const posts = useMemo(() => {
    let p = feed.data;
    if (filter === 'open') p = p.filter((x) => x.type === 'question' && (x.status === 'new' || x.status === 'need_clarification') && x.moderationStatus === 'visible');
    if (filter === 'pinned') p = p.filter((x) => x.isPinned);
    if (filter === 'hidden') p = p.filter((x) => x.moderationStatus === 'hidden');
    return sortPosts(p, sort);
  }, [feed.data, filter, sort]);

  const understanding = useMemo(() => {
    const visible = feed.data.filter((p) => p.moderationStatus === 'visible');
    return {
      understood: visible.reduce((n, p) => n + (p.reactionCounts?.understood ?? 0), 0),
      need: visible.reduce((n, p) => n + (p.reactionCounts?.need_explanation ?? 0), 0),
      top: [...visible].filter((p) => (p.reactionCounts?.need_explanation ?? 0) > 0).sort((a, b) => (b.reactionCounts?.need_explanation ?? 0) - (a.reactionCounts?.need_explanation ?? 0)).slice(0, 3),
    };
  }, [feed.data]);

  const control = async (action: 'start' | 'pause' | 'join-code/rotate', msg: string) => {
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/sessions/${sessionId}/${action}`);
      await invalidate(`/classes/${classId}`, '/teach', '/me/live');
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (meta.error) return <ErrorState error={meta.error} />;
  if (!s || !cls || !meta.data) return session.loading || meta.isLoading ? <Spinner /> : <EmptyState title={t('Không tìm thấy buổi học')} />;
  const manage = meta.data.access.canManage;
  const running = s.status === 'open' || s.status === 'paused';
  const openActs = acts.data.filter((a) => a.status === 'open').length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <PageHeader
          back={{ to: `/teach/classes/${classId}/sessions`, label: `${cls.classCode} · ${t('Buổi học')}` }}
          title={sessionLabel(s)}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <SessionStatusBadge status={s.status} /> {sessionTime(s)}
            </span>
          }
          actions={
            <Link to={`/present/${classId}/${sessionId}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Maximize2 className="h-4 w-4" /> {t('Trình chiếu')}
            </Link>
          }
        />
        {/* Mobile/tablet: compact control bar */}
        <div className="mb-4 xl:hidden">
          <ControlCard s={s} manage={manage} busy={busy} control={control} onEnd={() => setEnding(true)} stats={stats.data} />
        </div>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList className="mb-4">
            <TabsTrigger value="feed"><MessageCircleQuestion className="h-4 w-4" /> {t('Bảng tin')} {stats.data?.openQuestionCount ? <Badge tone="accent">{stats.data.openQuestionCount}</Badge> : null}</TabsTrigger>
            <TabsTrigger value="activities"><Activity className="h-4 w-4" /> {t('Hoạt động')} {openActs > 0 && <Badge tone="success">{t('{{count}} đang mở', { count: openActs })}</Badge>}</TabsTrigger>
            <TabsTrigger value="people"><Users className="h-4 w-4" /> {t('Người tham gia')} <Badge>{stats.data?.attendeeCount ?? 0}</Badge></TabsTrigger>
            <TabsTrigger value="summary"><FileText className="h-4 w-4" /> {t('Tóm tắt')}</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="space-y-4">
            <Composer classId={classId} sessionId={sessionId} topics={s.topics} allowAnonymous={false} disabled={s.status !== 'open'} disabledReason={s.status === 'paused' ? t('Buổi học đang tạm dừng') : t('Bắt đầu buổi học để đăng bài')} existing={feed.data} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {([
                  ['all', t('Tất cả')],
                  ['open', t('Chưa giải đáp')],
                  ['pinned', t('Đã ghim')],
                  ['hidden', t('Đã ẩn')],
                ] as [Filter, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn('rounded-full px-3 py-1 text-xs font-medium', filter === k ? 'bg-fg text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {l}
                  </button>
                ))}
              </div>
              <Select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'top')} className="h-8 w-auto text-xs" aria-label={t('Sắp xếp')}>
                <option value="new">{t('Mới nhất')}</option>
                <option value="top">{t('Nhiều bình chọn nhất')}</option>
              </Select>
            </div>
            {feed.loading ? (
              <ListSkeleton rows={3} />
            ) : !posts.length ? (
              <EmptyState title={filter === 'all' ? t('Chưa có bài đăng') : t('Không có bài phù hợp')} description={filter === 'all' ? (running ? t('Sinh viên vào bằng mã {{code}} hoặc quét QR.', { code: s.joinCode ?? '' }) : t('Bắt đầu buổi học để nhận câu hỏi.')) : undefined} />
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <PostCard
                    key={p.postId}
                    post={p}
                    classId={classId}
                    sessionId={sessionId}
                    staff
                    editWindowMinutes={cls.settings.editWindowMinutes}
                    revealAllowed={cls.settings.revealAnonymousToStaff}
                    onOpenThread={() => navigate(`posts/${p.postId}`)}
                    onAskAi={cls.settings.aiEnabled ? setAiPost : undefined}
                  />
                ))}
                {feed.data.length >= pageSize && (
                  <Button variant="outline" className="w-full" onClick={() => setPageSize((n) => n + 50)}>{t('Xem thêm')}</Button>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="activities" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreating(true)} disabled={s.status === 'archived'}>
                <Plus className="h-4 w-4" /> {t('Tạo hoạt động')}
              </Button>
            </div>
            {acts.loading ? (
              <ListSkeleton rows={2} />
            ) : !acts.data.length ? (
              <NoActivities staff onCreate={() => setCreating(true)} />
            ) : (
              acts.data.map((a) => (
                <StaffActivityCard key={a.activityId} classId={classId} sessionId={sessionId} activity={a} onPresent={() => window.open(`/present/${classId}/${sessionId}?activity=${a.activityId}`, '_blank')} />
              ))
            )}
          </TabsContent>
          <TabsContent value="people">
            <Attendance classId={classId} sessionId={sessionId} />
          </TabsContent>
          <TabsContent value="summary">
            <SessionSummaryEditor classId={classId} sessionId={sessionId} />
          </TabsContent>
        </Tabs>
      </div>
      <aside className="hidden space-y-4 xl:block">
        <ControlCard s={s} manage={manage} busy={busy} control={control} onEnd={() => setEnding(true)} stats={stats.data} />
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold">{t('Mức độ hiểu bài (phản hồi nhanh)')}</p>
            <div className="flex gap-2 text-sm">
              <span className="flex-1 rounded-lg bg-success-soft px-3 py-2 text-success">✅ {t('Đã hiểu')} <b className="ml-1">{understanding.understood}</b></span>
              <span className="flex-1 rounded-lg bg-warning-soft px-3 py-2 text-warning">❓ {t('Cần giải thích')} <b className="ml-1">{understanding.need}</b></span>
            </div>
            {understanding.top.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">{t('Nội dung nhiều SV cần giải thích thêm')}</p>
                <ul className="space-y-1">
                  {understanding.top.map((p) => (
                    <li key={p.postId}>
                      <Link to={`posts/${p.postId}`} className="line-clamp-2 text-sm hover:text-primary">
                        ({p.reactionCounts.need_explanation}) {p.content}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </aside>
      <AiDraftDialog open={!!aiPost} onOpenChange={(v) => !v && setAiPost(null)} classId={classId} sessionId={sessionId} post={aiPost} />
      <ActivityCreator open={creating} onOpenChange={setCreating} classId={classId} sessionId={sessionId} />
      <EndSessionDialog open={ending} onOpenChange={setEnding} classId={classId} sessionId={sessionId} />
    </div>
  );
}

function ControlCard({
  s,
  manage,
  busy,
  control,
  onEnd,
  stats,
}: {
  s: SessionDoc;
  manage: boolean;
  busy: boolean;
  control: (a: 'start' | 'pause' | 'join-code/rotate', m: string) => void;
  onEnd: () => void;
  stats: SessionStatsDoc | null;
}) {
  const { t } = useTranslation();
  const running = s.status === 'open' || s.status === 'paused';
  return (
    <Card>
      <CardBody className="space-y-4">
        {running && s.joinCode && (
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-border bg-white p-2">
              <QRCodeSVG value={joinUrl(s.joinCode)} size={96} level="M" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">{t('Mã tham gia')}</p>
              <p className="font-mono text-3xl font-bold tracking-[0.2em] text-primary">{s.joinCode}</p>
              {manage && (
                <button onClick={() => control('join-code/rotate', t('Đã đổi mã tham gia'))} className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                  <RefreshCw className="h-3 w-3" /> {t('Đổi mã')}
                </button>
              )}
            </div>
          </div>
        )}
        {manage && (
          <div className="flex flex-wrap gap-2">
            {s.status !== 'open' && s.status !== 'archived' && (
              <Button variant="secondary" onClick={() => control('start', s.status === 'draft' ? t('Buổi học đã bắt đầu') : t('Đã mở lại buổi học'))} loading={busy} className="flex-1">
                <Play className="h-4 w-4" /> {s.status === 'draft' ? t('Bắt đầu buổi học') : s.status === 'paused' ? t('Tiếp tục') : t('Mở lại')}
              </Button>
            )}
            {s.status === 'open' && (
              <Button variant="outline" onClick={() => control('pause', t('Đã tạm dừng'))} loading={busy} className="flex-1">
                <Pause className="h-4 w-4" /> {t('Tạm dừng', { context: 'action' })}
              </Button>
            )}
            {running && (
              <Button variant="danger-outline" onClick={onEnd} className="flex-1">
                <Square className="h-4 w-4" /> {t('Kết thúc')}
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [t('Tham gia'), stats?.attendeeCount ?? 0],
            [t('Có tương tác'), stats?.interactedCount ?? 0],
            [t('Câu hỏi', { context: 'n' }), stats?.questionCount ?? 0],
            [t('Trả lời', { context: 'n' }), stats?.answerCount ?? 0],
            [t('Chưa giải đáp'), stats?.openQuestionCount ?? 0],
            [t('Bài nộp HĐ'), stats?.submissionCount ?? 0],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-surface-2 px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{v}</p>
              <p className="text-[11px] text-muted">{l}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function EndSessionDialog({ open, onOpenChange, classId, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; classId: string; sessionId: string }) {
  const { t } = useTranslation();
  const [late, setLate] = useState(0);
  const [busy, setBusy] = useState(false);
  const end = async () => {
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/sessions/${sessionId}/end`, { lateReplyMinutes: late });
      await invalidate(`/classes/${classId}`, '/teach', '/me/live');
      toast.success(t('Đã kết thúc buổi học. Dữ liệu được lưu đầy đủ.'));
      onOpenChange(false);
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
      title={t('Kết thúc buổi học?')}
      description={t('Các hoạt động đang mở sẽ được đóng. Toàn bộ câu hỏi, câu trả lời và thống kê được giữ nguyên.')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Hủy')}</Button>
          <Button variant="danger" onClick={end} loading={busy}>{t('Kết thúc')}</Button>
        </>
      }
    >
      <Field label={t('Cho phép trả lời bổ sung sau khi kết thúc')} htmlFor="late">
        <Select id="late" value={late} onChange={(e) => setLate(Number(e.target.value))}>
          <option value={0}>{t('Không')}</option>
          <option value={60}>{t('Trong 1 giờ')}</option>
          <option value={60 * 24}>{t('Trong 1 ngày')}</option>
          <option value={60 * 24 * 3}>{t('Trong 3 ngày')}</option>
          <option value={60 * 24 * 7}>{t('Trong 7 ngày')}</option>
        </Select>
      </Field>
    </Dialog>
  );
}

function Attendance({ classId, sessionId }: { classId: string; sessionId: string }) {
  const { t } = useTranslation();
  const attQ = useMemo(() => query(collection(db, sessionPath(classId, sessionId), 'attendance'), orderBy('joinedAt', 'desc'), limit(500)), [classId, sessionId]);
  const metQ = useMemo(() => query(collection(db, 'classes', classId, 'studentSessionMetrics'), where('sessionId', '==', sessionId), limit(500)), [classId, sessionId]);
  const att = useLiveQuery<AttendanceDoc>(attQ);
  const met = useLiveQuery<StudentSessionMetricsDoc>(metQ);
  const byUid = new Map(met.data.map((m) => [m.uid, m]));
  if (att.loading) return <ListSkeleton />;
  if (!att.data.length) return <EmptyState icon={<Users className="h-6 w-6" />} title={t('Chưa có sinh viên tham gia')} />;
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>{t('Mã SV')}</Th>
            <Th>{t('Họ tên')}</Th>
            <Th>{t('Vào lúc')}</Th>
            <Th className="text-right">{t('Câu hỏi', { context: 'n' })}</Th>
            <Th className="text-right">{t('Trả lời', { context: 'n' })}</Th>
            <Th className="text-right">{t('Bình luận', { context: 'n' })}</Th>
            <Th className="text-right">{t('Phản hồi nhanh')}</Th>
            <Th className="text-right">{t('Hoạt động')}</Th>
          </tr>
        </thead>
        <tbody>
          {att.data.map((a) => {
            const m = byUid.get(a.uid);
            return (
              <tr key={a.uid}>
                <Td className="font-mono text-xs">{a.studentId}</Td>
                <Td>
                  <Link to={`/teach/classes/${classId}/analytics/students/${a.uid}`} className="hover:text-primary">{a.displayName}</Link>
                </Td>
                <Td className="text-muted" >
                  <span title={formatDateTime(a.joinedAt)}>{timeAgo(a.joinedAt)}</span>
                </Td>
                <Td className="text-right tabular-nums">{m?.questions ?? 0}</Td>
                <Td className="text-right tabular-nums">{m?.answers ?? 0}</Td>
                <Td className="text-right tabular-nums">{(m?.comments ?? 0) + (m?.reflections ?? 0)}</Td>
                <Td className="text-right tabular-nums">{m?.reactions ?? 0}</Td>
                <Td className="text-right tabular-nums">{m?.activitiesCompleted ?? 0}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
