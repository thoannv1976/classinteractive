import { ArrowRightLeft, Check, CheckCircle2, GitMerge, MoreHorizontal, Pencil, Plus, Scissors, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostDoc, PostRef, SessionDoc, TopicDoc } from '@classinteract/shared';
import { POST_TYPE_LABELS } from '@classinteract/shared';
import { AiJobButton, useLatestJob } from '@/components/classroom/AiJobs';
import { RoleBadge, StatusBadge } from '@/components/classroom/PostCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, ListSkeleton, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Table, Td, Th } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { cn, timeAgo } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';
import type { TopicRow } from './ClassOverviewPage';

type Thread = PostDoc & { replies: PostDoc[] };

/** Marker the API uses for posts without any topic (GET /analytics/topics?topic=…). */
const UNTAGGED = tk('Chưa phân loại');
const MAX_TOPICS = 5;

interface CatalogRow {
  name: string;
  topicId: string | null;
  description: string;
  source: TopicDoc['source'];
  questions: number;
  answers: number;
  comments: number;
  openQuestions: number;
  participants: number;
  sessions: number;
  pendingAi: number;
}
interface CatalogResp {
  items: CatalogRow[];
  untagged: { questions: number; answers: number } | null;
}
type SessionMap = Map<string, SessionDoc>;

const refreshTopics = (classId: string) =>
  invalidate(`/classes/${classId}/topics`, `/classes/${classId}/topic-reviews`, `/classes/${classId}/analytics`);

const checkboxCls = 'h-4 w-4 shrink-0 rounded border-border-strong accent-primary';

export function TopicsPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'catalog';
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${cls.classId}/sessions`);
  const catalog = useApi<CatalogResp>(`/classes/${cls.classId}/topics`);
  const reviews = useApi<{ items: PostDoc[] }>(`/classes/${cls.classId}/topic-reviews`);
  const sessionMap: SessionMap = new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s]));
  const names = (catalog.data?.items ?? []).map((r) => r.name);
  const pending = reviews.data?.items.length ?? 0;

  return (
    <Tabs value={tab} onValueChange={(v) => setParams(v === 'catalog' ? {} : { tab: v }, { replace: true })}>
      <TabsList className="mb-4">
        <TabsTrigger value="catalog">
          <Tag className="h-4 w-4" /> {t('Danh mục chủ đề')}
        </TabsTrigger>
        <TabsTrigger value="review">
          <Sparkles className="h-4 w-4" /> {t('Duyệt đề xuất của AI')}
          {pending > 0 && <Badge tone="ai">{pending}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="analysis">{t('Phân tích theo chủ đề')}</TabsTrigger>
      </TabsList>
      <TabsContent value="catalog">
        <CatalogTab classId={cls.classId} catalog={catalog} sessionMap={sessionMap} />
      </TabsContent>
      <TabsContent value="review">
        <ReviewTab
          classId={cls.classId}
          aiEnabled={cls.settings.aiEnabled}
          sessions={sessions.data?.items ?? []}
          sessionMap={sessionMap}
          names={names}
          reviews={reviews}
        />
      </TabsContent>
      <TabsContent value="analysis">
        <AnalysisTab classId={cls.classId} sessions={sessions.data?.items ?? []} sessionMap={sessionMap} names={names} />
      </TabsContent>
    </Tabs>
  );
}

// ------------------------------------------------------------------ (a) catalog

function CatalogTab({ classId, catalog, sessionMap }: { classId: string; catalog: UseQueryResult<CatalogResp>; sessionMap: SessionMap }) {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = catalog;
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [deleting, setDeleting] = useState<CatalogRow | null>(null);
  const [merging, setMerging] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = data?.items ?? [];
  const names = rows.map((r) => r.name);
  const visibleSelected = selected.filter((s) => names.includes(s));
  const toggle = (name: string) => setSelected((x) => (x.includes(name) ? x.filter((y) => y !== name) : [...x, name]));

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await api.del<{ postsUpdated: number }>(`/classes/${classId}/topics/${encodeURIComponent(deleting.name)}`);
      toast.success(t('Đã xóa chủ đề ({{count}} bài đăng được cập nhật)', { count: r.postsUpdated }));
      if (open === deleting.name) setOpen(null);
      setSelected((x) => x.filter((y) => y !== deleting.name));
      setDeleting(null);
      await refreshTopics(classId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('Danh mục chủ đề')}
          description={t('Chủ đề dùng chung cho mọi buổi học của lớp. Chọn một chủ đề để xem và sắp xếp lại các bài đăng của nó.')}
          actions={
            <>
              {visibleSelected.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  {t('Bỏ chọn')}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={visibleSelected.length < 2} onClick={() => setMerging(true)} title={t('Chọn ít nhất hai chủ đề để gộp')}>
                <GitMerge className="h-4 w-4" />
                {visibleSelected.length >= 2 ? t('Gộp {{count}} chủ đề', { count: visibleSelected.length }) : t('Gộp chủ đề')}
              </Button>
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> {t('Thêm chủ đề')}
              </Button>
            </>
          }
        />
        {isLoading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !rows.length && !data?.untagged ? (
          <EmptyState
            icon={<Tag className="h-6 w-6" />}
            title={t('Chưa có chủ đề nào')}
            description={t('Thêm chủ đề kiến thức của học phần để sinh viên gắn vào câu hỏi, hoặc để AI đề xuất từ nội dung thảo luận.')}
            action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Thêm chủ đề')}</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8"><span className="sr-only">{t('Chọn')}</span></Th>
                <Th>{t('Chủ đề')}</Th>
                <Th className="text-right">{t('Hỏi')}</Th>
                <Th className="text-right">{t('Đáp')}</Th>
                <Th className="text-right">{t('Chưa giải đáp')}</Th>
                <Th className="text-right">{t('SV')}</Th>
                <Th className="text-right">{t('Buổi')}</Th>
                <Th className="text-right">{t('Chờ duyệt')}</Th>
                <Th className="w-10"><span className="sr-only">{t('Thao tác')}</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} onClick={() => setOpen(row.name)} className={cn('cursor-pointer hover:bg-slate-50', open === row.name && 'bg-primary-soft')}>
                  <Td>
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={selected.includes(row.name)}
                      onChange={() => toggle(row.name)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('Chọn chủ đề {{name}}', { name: row.name })}
                    />
                  </Td>
                  <Td className="max-w-[320px] whitespace-normal">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      #{row.name}
                      {row.source === 'ai' && <Badge tone="ai" title={t('Chủ đề do AI đề xuất')}>AI</Badge>}
                    </span>
                    {row.description && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{row.description}</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{row.questions}</Td>
                  <Td className="text-right tabular-nums">{row.answers}</Td>
                  <Td className={cn('text-right tabular-nums', row.openQuestions > 0 && 'font-semibold text-accent')}>{row.openQuestions}</Td>
                  <Td className="text-right tabular-nums">{row.participants}</Td>
                  <Td className="text-right tabular-nums">{row.sessions}</Td>
                  <Td className="text-right">{row.pendingAi > 0 ? <Badge tone="ai">{row.pendingAi}</Badge> : <span className="text-muted">0</span>}</Td>
                  <Td>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Menu
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={t('Thao tác')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <MenuItem onSelect={() => setEditing(row)}>
                          <Pencil className="h-4 w-4" /> {t('Đổi tên / sửa mô tả')}
                        </MenuItem>
                        <MenuItem onSelect={() => setOpen(row.name)}>
                          <ArrowRightLeft className="h-4 w-4" /> {t('Xem và chuyển bài đăng')}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem danger onSelect={() => setDeleting(row)}>
                          <Trash2 className="h-4 w-4" /> {t('Xóa chủ đề')}
                        </MenuItem>
                      </Menu>
                    </span>
                  </Td>
                </tr>
              ))}
              {data?.untagged && (
                <tr onClick={() => setOpen(UNTAGGED)} className={cn('cursor-pointer hover:bg-slate-50', open === UNTAGGED && 'bg-primary-soft')}>
                  <Td />
                  <Td className="italic text-muted">{t('Chưa gắn chủ đề')}</Td>
                  <Td className="text-right tabular-nums">{data.untagged.questions}</Td>
                  <Td className="text-right tabular-nums">{data.untagged.answers}</Td>
                  <Td /><Td /><Td /><Td /><Td />
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>

      {open && <TopicThreads key={open} classId={classId} topic={open} names={names} sessionMap={sessionMap} onClose={() => setOpen(null)} />}

      <TopicFormDialog
        open={adding || !!editing}
        row={editing}
        classId={classId}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onRenamed={(from, to) => {
          if (open === from) setOpen(to);
          setSelected((x) => x.map((y) => (y === from ? to : y)));
        }}
      />
      <MergeTopicsDialog
        open={merging}
        classId={classId}
        selected={visibleSelected}
        names={names}
        onClose={() => setMerging(false)}
        onMerged={(into) => {
          setSelected([]);
          setOpen((o) => (o && visibleSelected.includes(o) ? into : o));
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={t('Xóa chủ đề #{{name}}?', { name: deleting?.name ?? '' })}
        description={t('Các bài đăng đang gắn chủ đề này sẽ mất nhãn này (bài đăng không bị xóa). Đề xuất của AI có chủ đề này cũng được gỡ. Không thể hoàn tác.')}
        confirmLabel={t('Xóa chủ đề')}
        danger
        loading={busy}
        onConfirm={remove}
      >
        {deleting && (deleting.questions > 0 || deleting.answers > 0) && (
          <p className="text-sm text-muted">{t('Hiện có {{questions}} câu hỏi và {{answers}} câu trả lời thuộc chủ đề này.', { questions: deleting.questions, answers: deleting.answers })}</p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function TopicFormDialog({
  open,
  row,
  classId,
  onClose,
  onRenamed,
}: {
  open: boolean;
  row: CatalogRow | null;
  classId: string;
  onClose: () => void;
  onRenamed: (from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (row?.name ?? '__new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    setName(row?.name ?? '');
    setDescription(row?.description ?? '');
  }

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      if (!row) {
        await api.post(`/classes/${classId}/topics`, { name: n, description: description.trim() });
        toast.success(t('Đã thêm chủ đề'));
      } else {
        const renamed = n !== row.name;
        const r = await api.patch<{ postsUpdated: number }>(`/classes/${classId}/topics/${encodeURIComponent(row.name)}`, {
          ...(renamed ? { name: n } : {}),
          description: description.trim(),
        });
        if (renamed) {
          onRenamed(row.name, n);
          toast.success(t('Đã đổi tên chủ đề ({{count}} bài đăng được cập nhật)', { count: r.postsUpdated }));
        } else toast.success(t('Đã lưu'));
      }
      await refreshTopics(classId);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={row ? t('Sửa chủ đề') : t('Thêm chủ đề')}
      description={row ? t('Đổi tên sẽ cập nhật mọi bài đăng và buổi học đang dùng chủ đề này.') : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>{t('Lưu')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Tên chủ đề')} htmlFor="topic-name">
          <Input id="topic-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label={t('Mô tả')} htmlFor="topic-desc" hint={t('Mô tả ngắn giúp AI phân loại câu hỏi chính xác hơn.')}>
          <Textarea id="topic-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}

function MergeTopicsDialog({
  open,
  classId,
  selected,
  names,
  onClose,
  onMerged,
}: {
  open: boolean;
  classId: string;
  selected: string[];
  names: string[];
  onClose: () => void;
  onMerged: (into: string) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string>('');
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTarget(selected[0] ?? '');
      setCustom('');
    }
  }
  const into = target === '__custom' ? custom.trim() : target;

  const save = async () => {
    if (!into) return;
    setSaving(true);
    try {
      const r = await api.post<{ postsUpdated: number }>(`/classes/${classId}/topics/merge`, { from: selected, into });
      toast.success(t('Đã gộp vào #{{name}} ({{count}} bài đăng được cập nhật)', { name: into, count: r.postsUpdated }));
      onMerged(into);
      await refreshTopics(classId);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t('Gộp chủ đề')}
      description={t('Các bài đăng của những chủ đề đã chọn sẽ chuyển sang chủ đề đích; các chủ đề còn lại bị xóa khỏi danh mục.')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!into}>
            <GitMerge className="h-4 w-4" /> {t('Gộp')}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t('Gộp vào chủ đề')}</legend>
        {selected.map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="radio" name="merge-into" className="h-4 w-4 accent-primary" checked={target === name} onChange={() => setTarget(name)} />
            #{name}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="merge-into" className="h-4 w-4 accent-primary" checked={target === '__custom'} onChange={() => setTarget('__custom')} />
          {t('Chủ đề khác hoặc tên mới')}
        </label>
        {target === '__custom' && (
          <>
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} placeholder={t('Tên chủ đề')} list="merge-topic-names" autoFocus />
            <datalist id="merge-topic-names">
              {names.filter((n) => !selected.includes(n)).map((n) => <option key={n} value={n} />)}
            </datalist>
          </>
        )}
      </fieldset>
    </Dialog>
  );
}

/** Threads of one topic, with selection to move posts to another topic or split them into a new one. */
function TopicThreads({ classId, topic, names, sessionMap, onClose }: { classId: string; topic: string; names: string[]; sessionMap: SessionMap; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useApi<{ threads?: Thread[] }>(`/classes/${classId}/analytics/topics?topic=${encodeURIComponent(topic)}`);
  const [picked, setPicked] = useState<string[]>([]);
  const [moveMode, setMoveMode] = useState<'move' | 'split' | null>(null);
  const [retag, setRetag] = useState<Thread | null>(null);
  const threads = data?.threads ?? [];
  const untagged = topic === UNTAGGED;
  const refs: PostRef[] = threads.filter((th) => picked.includes(th.postId)).map((th) => ({ sessionId: th.sessionId, postId: th.postId }));
  const allPicked = threads.length > 0 && refs.length === threads.length;

  return (
    <Card>
      <CardHeader
        title={untagged ? t('Bài đăng chưa gắn chủ đề') : `#${topic}`}
        description={t('{{count}} chủ đề thảo luận', { count: threads.length })}
        actions={
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={t('Đóng')}>
            <X className="h-4 w-4" />
          </Button>
        }
      />
      {threads.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 sm:px-5">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" className={checkboxCls} checked={allPicked} onChange={() => setPicked(allPicked ? [] : threads.map((th) => th.postId))} />
            {refs.length ? t('Đã chọn {{count}} bài', { count: refs.length }) : t('Chọn tất cả')}
          </label>
          <span className="flex-1" />
          <Button size="sm" variant="outline" disabled={!refs.length} onClick={() => setMoveMode('move')}>
            <ArrowRightLeft className="h-4 w-4" /> {untagged ? t('Gắn chủ đề') : t('Chuyển sang chủ đề khác')}
          </Button>
          {!untagged && (
            <Button size="sm" variant="outline" disabled={!refs.length} onClick={() => setMoveMode('split')}>
              <Scissors className="h-4 w-4" /> {t('Tách thành chủ đề mới')}
            </Button>
          )}
        </div>
      )}
      <CardBody className="space-y-3">
        {isLoading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState error={error} />
        ) : !threads.length ? (
          <EmptyState title={t('Chủ đề này chưa có bài đăng')} />
        ) : (
          threads.map((th) => (
            <ThreadCard
              key={th.postId}
              thread={th}
              classId={classId}
              sessionMap={sessionMap}
              onRetag={() => setRetag(th)}
              selected={picked.includes(th.postId)}
              onToggle={() => setPicked((x) => (x.includes(th.postId) ? x.filter((y) => y !== th.postId) : [...x, th.postId]))}
            />
          ))
        )}
      </CardBody>
      <MovePostsDialog
        mode={moveMode}
        classId={classId}
        from={untagged ? null : topic}
        posts={refs}
        names={names}
        onClose={() => setMoveMode(null)}
        onDone={() => setPicked([])}
      />
      <RetagDialog thread={retag} onClose={() => setRetag(null)} classId={classId} suggestions={names} />
    </Card>
  );
}

function MovePostsDialog({
  mode,
  classId,
  from,
  posts,
  names,
  onClose,
  onDone,
}: {
  mode: 'move' | 'split' | null;
  classId: string;
  /** null = the posts have no topic yet */
  from: string | null;
  posts: PostRef[];
  names: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const options = names.filter((n) => n !== from);
  const [target, setTarget] = useState('');
  const [newName, setNewName] = useState('');
  const [keep, setKeep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastMode, setLastMode] = useState<typeof mode>(null);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode) {
      setTarget(mode === 'split' || !options.length ? '__new' : options[0]!);
      setNewName('');
      setKeep(false);
    }
  }
  const isNew = mode === 'split' || target === '__new';
  const add = isNew ? newName.trim() : target;

  const save = async () => {
    if (!add || !posts.length) return;
    setSaving(true);
    try {
      const r = await api.post<{ postsUpdated: number }>(`/classes/${classId}/topics/move`, {
        posts,
        remove: from && !keep ? from : undefined,
        add: [add],
      });
      toast.success(t('Đã chuyển {{count}} bài đăng sang #{{name}}', { count: r.postsUpdated, name: add }));
      onDone();
      await refreshTopics(classId);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(v) => !v && onClose()}
      title={mode === 'split' ? t('Tách thành chủ đề mới') : from ? t('Chuyển sang chủ đề khác') : t('Gắn chủ đề')}
      description={
        mode === 'split'
          ? t('{{count}} bài đã chọn sẽ được chuyển từ #{{from}} sang một chủ đề mới.', { count: posts.length, from: from ?? '' })
          : t('Áp dụng cho {{count}} bài đã chọn. Câu trả lời đi theo chủ đề của câu hỏi.', { count: posts.length })
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!add}>{mode === 'split' ? t('Tách') : t('Chuyển')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {mode !== 'split' && (
          <Field label={t('Chủ đề đích')} htmlFor="move-target">
            <Select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              {options.map((n) => <option key={n} value={n}>#{n}</option>)}
              <option value="__new">{t('+ Chủ đề mới…')}</option>
            </Select>
          </Field>
        )}
        {isNew && (
          <Field label={t('Tên chủ đề mới')} htmlFor="move-new">
            <Input id="move-new" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} autoFocus />
          </Field>
        )}
        {from && mode === 'move' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className={cn(checkboxCls, 'mt-0.5')} checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>{t('Giữ cả chủ đề #{{name}} (chỉ thêm chủ đề mới)', { name: from })}</span>
          </label>
        )}
        <p className="text-xs text-muted">{t('Mỗi bài đăng có tối đa 5 chủ đề.')}</p>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ (b) AI review

type ReviewItem = PostRef & { action: 'accept' | 'reject' | 'edit'; topics?: string[] };

function ReviewTab({
  classId,
  aiEnabled,
  sessions,
  sessionMap,
  names,
  reviews,
}: {
  classId: string;
  aiEnabled: boolean;
  sessions: SessionDoc[];
  sessionMap: SessionMap;
  names: string[];
  reviews: UseQueryResult<{ items: PostDoc[] }>;
}) {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const { data, isLoading, error, refetch } = reviews;
  const items = (data?.items ?? []).filter((p) => !sessionId || p.sessionId === sessionId);

  // refresh when a classification job finishes (also jobs started elsewhere, e.g. when a session ends)
  const job = useLatestJob(classId, 'classify_topics');
  const prevStatus = useRef(job?.status);
  useEffect(() => {
    const before = prevStatus.current;
    prevStatus.current = job?.status;
    if (job?.status === 'completed' && (before === 'queued' || before === 'running')) void refreshTopics(classId);
  }, [job?.status, classId]);

  const submit = async (list: ReviewItem[], key: string) => {
    setBusy(key);
    try {
      for (let i = 0; i < list.length; i += 500) await api.post(`/classes/${classId}/topic-reviews`, { items: list.slice(i, i + 500) });
      toast.success(t('Đã cập nhật {{count}} bài đăng', { count: list.length }));
      setEditing(null);
      setConfirmAll(false);
      await refreshTopics(classId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const ref = (p: PostDoc): PostRef => ({ sessionId: p.sessionId, postId: p.postId });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('Đề xuất chủ đề của AI')} description={t('AI đọc câu hỏi và ý kiến của sinh viên rồi đề xuất chủ đề phù hợp trong danh mục (có thể đề xuất chủ đề mới).')} />
        <CardBody className="space-y-4">
          <Alert tone="info">
            {t('Đề xuất của AI chỉ là gợi ý và được lưu lại để đối chiếu. Chủ đề chính thức của bài đăng chỉ thay đổi khi bạn chấp nhận hoặc sửa.')}
          </Alert>
          {!aiEnabled ? (
            <Alert tone="warning">{t('Lớp này chưa bật chức năng AI. Bật trong Cài đặt lớp để dùng phân loại tự động.')}</Alert>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('Phạm vi')} htmlFor="classify-scope">
                <Select id="classify-scope" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-auto min-w-[160px]">
                  <option value="">{t('Cả lớp')}</option>
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>{t('Buổi {{n}}', { n: s.sessionNumber })}</option>
                  ))}
                </Select>
              </Field>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" className={checkboxCls} checked={force} onChange={(e) => setForce(e.target.checked)} />
                {t('Phân loại lại cả bài đã có đề xuất')}
              </label>
              <AiJobButton
                classId={classId}
                type="classify_topics"
                sessionId={sessionId || null}
                force={force || undefined}
                label={sessionId ? t('Phân loại chủ đề buổi này') : t('Phân loại chủ đề cả lớp')}
                onDone={() => void refreshTopics(classId)}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('Bài đăng chờ duyệt chủ đề')}
          description={sessionId ? t('Đang lọc theo buổi đã chọn.') : undefined}
          actions={
            <Button size="sm" variant="soft" disabled={!items.length || !!busy} onClick={() => setConfirmAll(true)}>
              <CheckCircle2 className="h-4 w-4" /> {t('Chấp nhận tất cả ({{count}})', { count: items.length })}
            </Button>
          }
        />
        {isLoading && !data ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !items.length ? (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t('Không có đề xuất nào chờ duyệt')} description={t('Chạy phân loại chủ đề bằng AI để nhận đề xuất cho các bài đăng chưa được phân loại.')} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p) => {
              const key = p.postId;
              return (
                <li key={key} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge>{t(POST_TYPE_LABELS[p.type])}</Badge>
                    {p.type === 'question' && <StatusBadge status={p.status} />}
                    <span>{t('Buổi {{n}}', { n: sessionMap.get(p.sessionId)?.sessionNumber ?? '?' })} · {p.authorName} · {timeAgo(p.createdAt)}</span>
                  </div>
                  <Link to={`/teach/classes/${classId}/sessions/${p.sessionId}/posts/${p.postId}`} className="block whitespace-pre-wrap text-sm hover:text-primary">
                    {p.content}
                  </Link>
                  <div className="grid gap-1.5 text-xs sm:grid-cols-[110px_minmax(0,1fr)]">
                    <span className="text-muted">{t('Chủ đề hiện tại')}</span>
                    <TopicChips topics={p.topics} empty={t('Chưa có')} />
                    <span className="text-muted">{t('Đề xuất của AI')}</span>
                    <TopicChips topics={p.aiTopics ?? []} tone="ai" empty={t('Không có')} />
                  </div>
                  {editing === key ? (
                    <ReviewEditor
                      initial={[...new Set([...p.topics, ...(p.aiTopics ?? [])])].slice(0, MAX_TOPICS)}
                      options={names}
                      saving={busy === key}
                      onCancel={() => setEditing(null)}
                      onSave={(topics) => submit([{ ...ref(p), action: 'edit', topics }], key)}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="soft" loading={busy === key} disabled={!!busy} onClick={() => submit([{ ...ref(p), action: 'accept' }], key)}>
                        <Check className="h-4 w-4" /> {t('Chấp nhận')}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setEditing(key)}>
                        <Pencil className="h-4 w-4" /> {t('Sửa')}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => submit([{ ...ref(p), action: 'reject' }], key)}>
                        <X className="h-4 w-4" /> {t('Bỏ qua')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('Chấp nhận tất cả đề xuất?')}
        description={t('Chủ đề AI đề xuất sẽ được thêm vào {{count}} bài đăng (chủ đề hiện có vẫn được giữ).', { count: items.length })}
        confirmLabel={t('Chấp nhận tất cả')}
        loading={busy === '__all'}
        onConfirm={() => submit(items.map((p) => ({ ...ref(p), action: 'accept' as const })), '__all')}
      />
    </div>
  );
}

function TopicChips({ topics, tone, empty }: { topics: string[]; tone?: 'ai'; empty: string }) {
  if (!topics.length) return <span className="text-muted">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {topics.map((tp) => (
        <span key={tp} className={cn('rounded-md px-1.5 py-0.5 font-medium', tone === 'ai' ? 'bg-violet-50 text-violet-700' : 'bg-secondary-soft text-secondary')}>
          #{tp}
        </span>
      ))}
    </span>
  );
}

function ReviewEditor({ initial, options, saving, onCancel, onSave }: { initial: string[]; options: string[]; saving: boolean; onCancel: () => void; onSave: (topics: string[]) => void }) {
  const { t } = useTranslation();
  const [topics, setTopics] = useState(initial);
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <TopicPicker value={topics} onChange={setTopics} options={options} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onSave(topics)} loading={saving}>{t('Lưu chủ đề')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('Hủy')}</Button>
      </div>
    </div>
  );
}

/** Toggle chips from the catalog + add a new topic (max 5). */
function TopicPicker({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const toggle = (tp: string) => onChange(value.includes(tp) ? value.filter((y) => y !== tp) : value.length < MAX_TOPICS ? [...value, tp] : value);
  const all = [...new Set([...options, ...value])];
  const addNew = () => {
    const v = input.trim().slice(0, 80);
    if (v && !value.includes(v)) toggle(v);
    setInput('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((tp) => (
          <button
            key={tp}
            type="button"
            onClick={() => toggle(tp)}
            aria-pressed={value.includes(tp)}
            className={cn('rounded-md px-2 py-1 text-xs font-medium', value.includes(tp) ? 'bg-secondary text-white' : 'bg-secondary-soft text-secondary hover:bg-teal-100')}
          >
            #{tp}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addNew();
            }
          }}
          placeholder={t('Chủ đề mới')}
          maxLength={80}
          className="h-9"
        />
        <Button variant="outline" size="sm" className="h-9" onClick={addNew} disabled={!input.trim() || value.length >= MAX_TOPICS}>
          {t('Thêm')}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">{t('Đã chọn {{n}}/5 chủ đề', { n: value.length })}</p>
    </div>
  );
}

// ------------------------------------------------------------------ (c) analysis

function AnalysisTab({ classId, sessions, sessionMap, names }: { classId: string; sessions: SessionDoc[]; sessionMap: SessionMap; names: string[] }) {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const qs = `${sessionId ? `sessionId=${sessionId}&` : ''}${topic ? `topic=${encodeURIComponent(topic)}` : ''}`;
  const { data, isLoading, error } = useApi<{ topics: TopicRow[]; threads?: Thread[] }>(`/classes/${classId}/analytics/topics?${qs}`);
  const [retag, setRetag] = useState<Thread | null>(null);
  const label = (tp: string) => (tp === UNTAGGED ? t(UNTAGGED) : `#${tp}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title={t('Chủ đề kiến thức')}
          actions={
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-8 w-auto text-xs" aria-label={t('Lọc buổi')}>
              <option value="">{t('Mọi buổi')}</option>
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{t('Buổi {{n}}', { n: s.sessionNumber })}</option>
              ))}
            </Select>
          }
        />
        {isLoading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} />
        ) : !data?.topics.length ? (
          <EmptyState icon={<Tag className="h-6 w-6" />} title={t('Chưa có dữ liệu chủ đề')} description={t('Thêm chủ đề cho buổi học để sinh viên gắn vào câu hỏi.')} />
        ) : (
          <Table>
            <thead>
              <tr><Th>{t('Chủ đề')}</Th><Th className="text-right">{t('Hỏi')}</Th><Th className="text-right">{t('Đáp')}</Th><Th className="text-right">{t('SV')}</Th><Th className="text-right">{t('Chờ')}</Th></tr>
            </thead>
            <tbody>
              {data.topics.map((row) => (
                <tr key={row.topic} onClick={() => setTopic(row.topic)} className={cn('cursor-pointer hover:bg-slate-50', topic === row.topic && 'bg-primary-soft')}>
                  <Td className={cn('font-medium', row.topic === UNTAGGED && 'italic text-muted')}>{label(row.topic)}</Td>
                  <Td className="text-right tabular-nums">{row.questions}</Td>
                  <Td className="text-right tabular-nums">{row.answers}</Td>
                  <Td className="text-right tabular-nums">{row.participants}</Td>
                  <Td className={cn('text-right tabular-nums', row.openQuestions > 0 && 'font-semibold text-accent')}>{row.openQuestions}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="min-w-0 space-y-3">
        {!topic ? (
          <Card><EmptyState title={t('Chọn một chủ đề')} description={t('Xem toàn bộ câu hỏi và câu trả lời của chủ đề đó qua các buổi học.')} /></Card>
        ) : isLoading ? (
          <Spinner />
        ) : (
          <>
            <h2 className="text-lg font-semibold">{label(topic)} <span className="text-sm font-normal text-muted">· {t('{{count}} chủ đề thảo luận', { count: data?.threads?.length ?? 0 })}</span></h2>
            {data?.threads?.map((th) => (
              <ThreadCard key={th.postId} thread={th} classId={classId} sessionMap={sessionMap} onRetag={() => setRetag(th)} />
            ))}
          </>
        )}
      </div>
      <RetagDialog thread={retag} onClose={() => setRetag(null)} classId={classId} suggestions={names} />
    </div>
  );
}

// ------------------------------------------------------------------ shared pieces

function ThreadCard({
  thread: th,
  classId,
  sessionMap,
  onRetag,
  selected,
  onToggle,
}: {
  thread: Thread;
  classId: string;
  sessionMap: SessionMap;
  onRetag: () => void;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className={cn(selected && 'border-primary ring-1 ring-primary/30')}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {onToggle && (
            <input type="checkbox" className={checkboxCls} checked={!!selected} onChange={onToggle} aria-label={t('Chọn bài đăng')} />
          )}
          <Badge>{t(POST_TYPE_LABELS[th.type])}</Badge>
          {th.type === 'question' && <StatusBadge status={th.status} />}
          <span>{t('Buổi {{n}}', { n: sessionMap.get(th.sessionId)?.sessionNumber ?? '?' })} · {th.authorName} · {timeAgo(th.createdAt)} · ▲{th.voteCount}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onRetag}>
            <Tag className="h-3.5 w-3.5" /> {t('Đổi chủ đề')}
          </Button>
        </div>
        <Link to={`/teach/classes/${classId}/sessions/${th.sessionId}/posts/${th.postId}`} className="block whitespace-pre-wrap text-[15px] hover:text-primary">{th.content}</Link>
        {th.topics.length > 1 && <TopicChips topics={th.topics} empty="" />}
        {th.replies.length > 0 && (
          <ul className="space-y-2 border-l-2 border-border pl-3">
            {th.replies.map((r) => (
              <li key={r.postId} className={cn('text-sm', r.isAccepted && 'rounded-md bg-green-50 p-2')}>
                <span className="mr-2 inline-flex items-center gap-1 font-medium">
                  {r.authorName} <RoleBadge post={r} />
                  {r.isAccepted && <CheckCircle2 className="h-4 w-4 text-success" />}
                </span>
                <span className="whitespace-pre-wrap text-slate-700">{r.content}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function RetagDialog({ thread, onClose, classId, suggestions }: { thread: Thread | null; onClose: () => void; classId: string; suggestions: string[] }) {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (thread && thread.postId !== lastId) {
    setLastId(thread.postId);
    setTopics(thread.topics);
  }
  const close = () => {
    setLastId(null);
    onClose();
  };
  const save = async () => {
    if (!thread) return;
    setSaving(true);
    try {
      await api.patch(`/classes/${classId}/sessions/${thread.sessionId}/posts/${thread.postId}/moderation`, { topics });
      await refreshTopics(classId);
      toast.success(t('Đã cập nhật chủ đề'));
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={!!thread}
      onOpenChange={(v) => !v && close()}
      title={t('Chuyển chủ đề')}
      description={t('Chọn tối đa 5 chủ đề cho bài đăng này. Câu trả lời đi theo chủ đề của câu hỏi.')}
      size="sm"
      footer={<><Button variant="outline" onClick={close}>{t('Hủy')}</Button><Button onClick={save} loading={saving}>{t('Lưu')}</Button></>}
    >
      <TopicPicker value={topics} onChange={setTopics} options={suggestions} />
    </Dialog>
  );
}
