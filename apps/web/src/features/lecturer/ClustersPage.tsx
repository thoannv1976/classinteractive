import { ArrowRightLeft, CheckCircle2, ChevronUp, GitMerge, Layers, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ClusterDoc, PostDoc, PostRef, SessionDoc } from '@classinteract/shared';
import { AiJobButton, useLatestJob } from '@/components/classroom/AiJobs';
import { StatusBadge } from '@/components/classroom/PostCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, ListSkeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { tk } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { invalidate, useApi } from '@/lib/query';
import { cn } from '@/lib/utils';
import { useClassCtx } from './ClassLayout';

interface ClustersResp {
  clusters: ClusterDoc[];
  /** Questions of every cluster, keyed by postId. */
  posts: Record<string, PostDoc>;
}

const METHOD_LABELS: Record<ClusterDoc['method'], string> = {
  embedding: tk('Theo ngữ nghĩa'),
  llm: tk('Mô hình ngôn ngữ'),
  manual: tk('Thủ công'),
};
const METHOD_HINTS: Record<ClusterDoc['method'], string> = {
  embedding: tk('Gom theo độ gần nghĩa (embedding)'),
  llm: tk('Do mô hình ngôn ngữ gom nhóm'),
  manual: tk('Do giảng viên gộp hoặc sắp xếp'),
};
const PREVIEW = 5;

export function ClustersPage() {
  const { t } = useTranslation();
  const { cls } = useClassCtx();
  const classId = cls.classId;
  const [sessionId, setSessionId] = useState('');
  const sessions = useApi<{ items: SessionDoc[] }>(`/classes/${classId}/sessions`);
  const path = sessionId ? `/classes/${classId}/clusters?scope=session&sessionId=${sessionId}` : `/classes/${classId}/clusters?scope=class`;
  const { data, isLoading, error, refetch } = useApi<ClustersResp>(path);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClusterDoc | null>(null);
  const [dissolving, setDissolving] = useState<ClusterDoc | null>(null);
  const [merging, setMerging] = useState(false);
  const [moving, setMoving] = useState<{ item: PostRef; from: ClusterDoc } | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionNo = new Map((sessions.data?.items ?? []).map((s) => [s.sessionId, s.sessionNumber]));
  const clusters = data?.clusters ?? [];
  const picked = clusters.filter((c) => selected.includes(c.clusterId));
  const refresh = () => invalidate(`/classes/${classId}/clusters`);

  // refresh when a clustering job for this scope finishes (also jobs started elsewhere)
  const job = useLatestJob(classId, 'cluster_questions', sessionId || null);
  const prevStatus = useRef(job?.status);
  useEffect(() => {
    const before = prevStatus.current;
    prevStatus.current = job?.status;
    if (job?.status === 'completed' && (before === 'queued' || before === 'running')) void invalidate(`/classes/${classId}/clusters`);
  }, [job?.status, classId]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const jobButton = cls.settings.aiEnabled ? (
    <AiJobButton
      classId={classId}
      type="cluster_questions"
      sessionId={sessionId || null}
      force={clusters.length > 0 || undefined}
      label={clusters.length ? t('Gom nhóm lại') : t('Gom nhóm câu hỏi')}
      onDone={() => void refresh()}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('Nhóm câu hỏi')}
          description={t('Các câu hỏi cùng ý nghĩa được gom thành một nhóm vấn đề, giúp bạn giải đáp một lần cho nhiều sinh viên.')}
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('Phạm vi')} htmlFor="cluster-scope">
              <Select
                id="cluster-scope"
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setSelected([]);
                }}
                className="w-auto min-w-[160px]"
              >
                <option value="">{t('Cả lớp')}</option>
                {sessions.data?.items.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>{t('Buổi {{n}}', { n: s.sessionNumber })}</option>
                ))}
              </Select>
            </Field>
            {jobButton}
          </div>
          {!cls.settings.aiEnabled ? (
            <Alert tone="warning">{t('Lớp này chưa bật chức năng AI. Bật trong Cài đặt lớp để gom nhóm câu hỏi tự động.')}</Alert>
          ) : (
            clusters.length > 0 && <p className="text-xs text-muted">{t('Nhóm bạn đã chỉnh sửa được giữ nguyên khi gom nhóm lại.')}</p>
          )}
        </CardBody>
      </Card>

      {clusters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">
            {t('{{count}} nhóm', { count: clusters.length })} · {t('{{count}} câu hỏi', { count: clusters.reduce((n, c) => n + c.questionCount, 0) })} ·{' '}
            {t('{{count}} nhóm đang mở', { count: clusters.filter((c) => c.status === 'open').length })}
          </p>
          <span className="flex-1" />
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>{t('Bỏ chọn')}</Button>
          )}
          <Button size="sm" variant="outline" disabled={picked.length < 2} onClick={() => setMerging(true)} title={t('Chọn ít nhất hai nhóm để gộp')}>
            <GitMerge className="h-4 w-4" /> {picked.length >= 2 ? t('Gộp {{count}} nhóm', { count: picked.length }) : t('Gộp nhóm')}
          </Button>
        </div>
      )}

      {isLoading && !data ? (
        <ListSkeleton />
      ) : error ? (
        <Card><ErrorState error={error} onRetry={() => refetch()} /></Card>
      ) : !clusters.length ? (
        <Card>
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title={t('Chưa có nhóm câu hỏi')}
            description={
              <>
                {t('AI gom các câu hỏi có cùng ý nghĩa vào một nhóm, kể cả khi sinh viên diễn đạt khác nhau.')}{' '}
                {t('Kết quả tốt nhất khi có API key OpenAI hoặc Gemini (dùng embedding); nếu không, mô hình ngôn ngữ sẽ tự gom nhóm.')}
              </>
            }
            action={jobButton}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {clusters.map((c) => (
            <ClusterCard
              key={c.clusterId}
              cluster={c}
              posts={data!.posts}
              classId={classId}
              sessionNo={sessionNo}
              showSession={!sessionId}
              selected={selected.includes(c.clusterId)}
              busy={busy}
              onToggle={() => setSelected((x) => (x.includes(c.clusterId) ? x.filter((y) => y !== c.clusterId) : [...x, c.clusterId]))}
              onEdit={() => setEditing(c)}
              onDissolve={() => setDissolving(c)}
              onStatus={(status) =>
                run(() => api.patch(`/classes/${classId}/clusters/${c.clusterId}`, { status }), status === 'resolved' ? t('Đã đánh dấu nhóm là đã giải quyết') : t('Đã mở lại nhóm'))
              }
              onMove={(item) => setMoving({ item, from: c })}
              onRemove={(item) => run(() => api.post(`/classes/${classId}/clusters/move`, { item, toClusterId: null, fromClusterId: c.clusterId }), t('Đã bỏ câu hỏi khỏi nhóm'))}
            />
          ))}
        </div>
      )}

      <EditClusterDialog cluster={editing} classId={classId} onClose={() => setEditing(null)} onSaved={refresh} />
      <MergeClustersDialog
        open={merging}
        clusters={picked}
        classId={classId}
        onClose={() => setMerging(false)}
        onMerged={async () => {
          setSelected([]);
          await refresh();
        }}
      />
      <MoveItemDialog
        move={moving}
        clusters={clusters}
        classId={classId}
        onClose={() => setMoving(null)}
        onMoved={refresh}
      />
      <ConfirmDialog
        open={!!dissolving}
        onOpenChange={(v) => !v && setDissolving(null)}
        title={t('Giải tán nhóm “{{name}}”?', { name: dissolving?.name ?? '' })}
        description={t('Chỉ nhóm bị xóa; các câu hỏi vẫn được giữ nguyên. Lần gom nhóm sau, AI có thể xếp lại các câu hỏi này.')}
        confirmLabel={t('Giải tán nhóm')}
        danger
        loading={busy}
        onConfirm={async () => {
          const c = dissolving;
          if (!c) return;
          if (await run(() => api.del(`/classes/${classId}/clusters/${c.clusterId}`), t('Đã giải tán nhóm'))) {
            setSelected((x) => x.filter((y) => y !== c.clusterId));
            setDissolving(null);
          }
        }}
      />
    </div>
  );
}

function ClusterCard({
  cluster: c,
  posts,
  classId,
  sessionNo,
  showSession,
  selected,
  busy,
  onToggle,
  onEdit,
  onDissolve,
  onStatus,
  onMove,
  onRemove,
}: {
  cluster: ClusterDoc;
  posts: Record<string, PostDoc>;
  classId: string;
  sessionNo: Map<string, number>;
  showSession: boolean;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDissolve: () => void;
  onStatus: (s: ClusterDoc['status']) => void;
  onMove: (item: PostRef) => void;
  onRemove: (item: PostRef) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const items = [...c.items].sort((a, b) => (posts[b.postId]?.voteCount ?? -1) - (posts[a.postId]?.voteCount ?? -1));
  const shown = expanded ? items : items.slice(0, PREVIEW);

  return (
    <Card className={cn(selected && 'border-primary ring-1 ring-primary/30')}>
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
          checked={selected}
          onChange={onToggle}
          aria-label={t('Chọn nhóm {{name}}', { name: c.name })}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{c.name}</h3>
          {c.description && <p className="mt-0.5 text-sm text-muted">{c.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.status === 'resolved' ? <Badge tone="success">{t('Đã giải quyết')}</Badge> : <Badge tone="warning">{t('Đang mở')}</Badge>}
            <Badge tone="primary">{t('{{count}} câu hỏi', { count: c.questionCount })}</Badge>
            <Badge>{t('{{count}} sinh viên', { count: c.studentCount })}</Badge>
            {c.sessionCount > 1 && <Badge>{t('{{count}} buổi', { count: c.sessionCount })}</Badge>}
            <Badge tone="accent" title={t('Mức quan tâm: {{n}}', { n: c.interest })}>▲ {c.voteCount}</Badge>
            {c.openCount > 0 && <Badge tone="danger">{t('{{count}} chưa giải đáp', { count: c.openCount })}</Badge>}
            <Badge tone="ai" title={t(METHOD_HINTS[c.method])}>{t(METHOD_LABELS[c.method])}</Badge>
            {c.locked && <Badge tone="secondary" title={t('Nhóm này được giữ nguyên khi AI gom nhóm lại')}>{t('Đã chỉnh sửa')}</Badge>}
          </div>
        </div>
        <Menu
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={t('Thao tác')}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        >
          <MenuItem onSelect={onEdit}>
            <Pencil className="h-4 w-4" /> {t('Đổi tên / sửa mô tả')}
          </MenuItem>
          {c.status === 'open' ? (
            <MenuItem onSelect={() => onStatus('resolved')} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" /> {t('Đánh dấu đã giải quyết')}
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => onStatus('open')} disabled={busy}>
              <RotateCcw className="h-4 w-4" /> {t('Mở lại nhóm')}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem danger onSelect={onDissolve}>
            <Trash2 className="h-4 w-4" /> {t('Giải tán nhóm')}
          </MenuItem>
        </Menu>
      </div>
      <ul className="divide-y divide-border">
        {shown.map((it) => {
          const p = posts[it.postId];
          return (
            <li key={it.postId} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <span className="mt-0.5 inline-flex w-10 shrink-0 items-center justify-center gap-0.5 rounded-md bg-primary-soft py-0.5 text-xs font-semibold tabular-nums text-primary">
                <ChevronUp className="h-3 w-3" />
                {p?.voteCount ?? 0}
              </span>
              <div className="min-w-0 flex-1">
                {p ? (
                  <Link to={`/teach/classes/${classId}/sessions/${it.sessionId}/posts/${it.postId}`} className="line-clamp-3 text-sm hover:text-primary">
                    {p.content}
                  </Link>
                ) : (
                  <span className="text-sm italic text-muted">{t('Bài đăng không còn tồn tại')}</span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {p && <StatusBadge status={p.status} />}
                  {showSession && <span>{t('Buổi {{n}}', { n: sessionNo.get(it.sessionId) ?? '?' })}</span>}
                  {p && <span>{p.authorName}</span>}
                </div>
              </div>
              <Menu
                trigger={
                  <Button size="icon-sm" variant="ghost" aria-label={t('Thao tác với câu hỏi')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              >
                <MenuItem onSelect={() => onMove(it)} disabled={busy}>
                  <ArrowRightLeft className="h-4 w-4" /> {t('Chuyển sang nhóm khác')}
                </MenuItem>
                <MenuItem onSelect={() => onRemove(it)} disabled={busy}>
                  <X className="h-4 w-4" /> {t('Bỏ khỏi nhóm')}
                </MenuItem>
              </Menu>
            </li>
          );
        })}
      </ul>
      {items.length > PREVIEW && (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <Button size="sm" variant="link" onClick={() => setExpanded((x) => !x)}>
            {expanded ? t('Thu gọn') : t('Xem thêm {{count}} câu hỏi', { count: items.length - PREVIEW })}
          </Button>
        </div>
      )}
    </Card>
  );
}

function EditClusterDialog({ cluster, classId, onClose, onSaved }: { cluster: ClusterDoc | null; classId: string; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ClusterDoc['status']>('open');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const id = cluster?.clusterId ?? null;
  if (id !== lastId) {
    setLastId(id);
    if (cluster) {
      setName(cluster.name);
      setDescription(cluster.description);
      setStatus(cluster.status);
    }
  }
  const save = async () => {
    if (!cluster || !name.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/classes/${classId}/clusters/${cluster.clusterId}`, { name: name.trim(), description: description.trim(), status });
      toast.success(t('Đã lưu. Nhóm đã chỉnh sửa sẽ được giữ nguyên khi AI gom nhóm lại.'));
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={!!cluster}
      onOpenChange={(v) => !v && onClose()}
      title={t('Sửa nhóm câu hỏi')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>{t('Lưu')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Tên nhóm')} htmlFor="cluster-name">
          <Input id="cluster-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label={t('Mô tả')} htmlFor="cluster-desc">
          <Textarea id="cluster-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label={t('Trạng thái')} htmlFor="cluster-status">
          <Select id="cluster-status" value={status} onChange={(e) => setStatus(e.target.value as ClusterDoc['status'])}>
            <option value="open">{t('Đang mở')}</option>
            <option value="resolved">{t('Đã giải quyết')}</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function MergeClustersDialog({
  open,
  clusters,
  classId,
  onClose,
  onMerged,
}: {
  open: boolean;
  clusters: ClusterDoc[];
  classId: string;
  onClose: () => void;
  onMerged: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(clusters[0]?.name ?? '');
  }
  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/classes/${classId}/clusters/merge`, { ids: clusters.map((c) => c.clusterId), name: name.trim() || undefined });
      toast.success(t('Đã gộp {{count}} nhóm', { count: clusters.length }));
      await onMerged();
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
      title={t('Gộp nhóm câu hỏi')}
      description={t('Tất cả câu hỏi của {{count}} nhóm đã chọn sẽ nằm trong một nhóm.', { count: clusters.length })}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={clusters.length < 2}>
            <GitMerge className="h-4 w-4" /> {t('Gộp')}
          </Button>
        </>
      }
    >
      <Field label={t('Tên nhóm sau khi gộp')} htmlFor="merge-cluster-name">
        <Input id="merge-cluster-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </Field>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {clusters.map((c) => (
          <button
            key={c.clusterId}
            type="button"
            onClick={() => setName(c.name)}
            className={cn('rounded-md px-2 py-1 text-left text-xs', name === c.name ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
          >
            {c.name}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function MoveItemDialog({
  move,
  clusters,
  classId,
  onClose,
  onMoved,
}: {
  move: { item: PostRef; from: ClusterDoc } | null;
  clusters: ClusterDoc[];
  classId: string;
  onClose: () => void;
  onMoved: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const options = clusters.filter((c) => c.clusterId !== move?.from.clusterId);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const id = move ? `${move.from.clusterId}:${move.item.postId}` : null;
  if (id !== lastId) {
    setLastId(id);
    setTarget(options[0]?.clusterId ?? '');
  }
  const save = async () => {
    if (!move || !target) return;
    setSaving(true);
    try {
      await api.post(`/classes/${classId}/clusters/move`, { item: move.item, toClusterId: target, fromClusterId: move.from.clusterId });
      toast.success(t('Đã chuyển câu hỏi sang nhóm khác'));
      await onMoved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={!!move}
      onOpenChange={(v) => !v && onClose()}
      title={t('Chuyển câu hỏi sang nhóm khác')}
      description={move ? t('Đang ở nhóm: {{name}}', { name: move.from.name }) : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!target}>{t('Chuyển')}</Button>
        </>
      }
    >
      {options.length ? (
        <Field label={t('Nhóm đích')} htmlFor="move-cluster">
          <Select id="move-cluster" value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.map((c) => (
              <option key={c.clusterId} value={c.clusterId}>{c.name}</option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-muted">{t('Không có nhóm nào khác trong phạm vi này.')}</p>
      )}
    </Dialog>
  );
}
