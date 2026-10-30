import {
  Bot,
  CheckCircle2,
  ChevronUp,
  EyeOff,
  Eye,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Smile,
  Sparkles,
  Trash2,
  UserSearch,
  Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PostDoc, QuestionStatus, Reaction, ReactionDoc } from '@classinteract/shared';
import { POST_TYPE_LABELS, QUESTION_STATUS_LABELS, REACTIONS, REACTION_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Avatar } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useOnceDoc } from '@/lib/firestore';
import { isMyPost } from '@/lib/myPosts';
import { cn, timeAgo, toDate } from '@/lib/utils';
import { sessionPath } from './hooks';

const REACTION_EMOJI: Record<Reaction, string> = {
  agree: '👍',
  disagree: '👎',
  helpful: '💡',
  same_question: '🙋',
  need_explanation: '❓',
  understood: '✅',
};

const STATUS_TONE: Record<QuestionStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'accent'> = {
  new: 'accent',
  answered: 'primary',
  need_clarification: 'warning',
  resolved: 'success',
  archived: 'neutral',
};

export function RoleBadge({ post }: { post: PostDoc }) {
  const { t } = useTranslation();
  if (post.isAiGenerated) return <Badge tone="ai"><Bot className="h-3 w-3" /> AI Generated{post.approvedBy ? ' · ' + t('GV đã duyệt') : ''}</Badge>;
  if (post.authorRole === 'lecturer') return <Badge tone="primary">{t('Giảng viên')}</Badge>;
  if (post.authorRole === 'admin') return <Badge tone="primary">{t('Quản trị')}</Badge>;
  if (post.authorRole === 'ta') return <Badge tone="secondary">{t('Trợ giảng')}</Badge>;
  return null;
}

export function StatusBadge({ status }: { status: QuestionStatus | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status]}>{t(QUESTION_STATUS_LABELS[status])}</Badge>;
}

interface Props {
  post: PostDoc;
  classId: string;
  sessionId: string;
  staff: boolean;
  editWindowMinutes: number;
  revealAllowed?: boolean;
  compact?: boolean;
  onOpenThread?: () => void;
  onAskAi?: (post: PostDoc) => void;
  canAskAiAsStudent?: boolean;
  isOwn?: boolean;
}

export function PostCard({ post, classId, sessionId, staff, editWindowMinutes, revealAllowed, compact, onOpenThread, onAskAi, canAskAiAsStudent, isOwn }: Props) {
  const me = useMe();
  const { t } = useTranslation();
  const base = `/classes/${classId}/sessions/${sessionId}/posts/${post.postId}`;
  const [mine, setMine] = useOnceDoc<ReactionDoc>(`${sessionPath(classId, sessionId)}/posts/${post.postId}/reactions/${me.uid}`);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [author, setAuthor] = useState<{ displayName: string; studentId: string | null } | null>(null);

  const ownPost = isOwn ?? (post.authorId === me.uid || (post.isAnonymous && isMyPost(post.postId)));
  const withinWindow = Date.now() - (toDate(post.createdAt)?.getTime() ?? 0) < editWindowMinutes * 60000;
  const hidden = post.moderationStatus === 'hidden';
  const isQuestion = post.type === 'question';
  const authorName = post.isAnonymous || post.isAiGenerated ? t(post.authorName) : post.authorName;

  const react = async (body: { reaction?: Reaction | null; upvoted?: boolean }) => {
    const prev = mine;
    setMine({ uid: me.uid, reaction: body.reaction !== undefined ? body.reaction : (mine?.reaction ?? null), upvoted: body.upvoted ?? mine?.upvoted ?? false, updatedAt: new Date() });
    try {
      const r = await api.post<{ reaction: Reaction | null; upvoted: boolean }>(`${base}/reactions`, body);
      setMine({ uid: me.uid, ...r, updatedAt: new Date() });
    } catch (e) {
      setMine(prev);
      toast.error(errorMessage(e));
    }
  };

  const moderate = async (body: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      await api.patch(`${base}/moderation`, body);
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.patch(base, { content: editText });
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(base);
      setConfirmDelete(false);
      toast.success(t('Đã xóa bài'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    try {
      setAuthor(await api.get(`${base}/author`));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const counts = post.reactionCounts ?? {};
  const topReactions = REACTIONS.filter((r) => (counts[r] ?? 0) > 0);

  return (
    <article
      className={cn(
        'rounded-xl border bg-surface p-4 shadow-[var(--shadow-card)]',
        post.isPinned ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
        post.isAccepted && 'border-green-300 bg-green-50/40',
        post.isAiGenerated && 'border-violet-200 bg-violet-50/30',
        hidden && 'opacity-60',
        compact && 'p-3',
      )}
      aria-label={t('{{type}} của {{name}}', { type: t(POST_TYPE_LABELS[post.type]), name: authorName })}
    >
      <header className="flex items-start gap-3">
        <Avatar name={authorName} ai={post.isAiGenerated} className={compact ? 'h-8 w-8' : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{authorName}</span>
            <RoleBadge post={post} />
            {post.isRoot && <Badge tone="neutral">{t(POST_TYPE_LABELS[post.type])}</Badge>}
            {isQuestion && <StatusBadge status={post.status} />}
            {post.isPinned && (
              <Badge tone="primary">
                <Pin className="h-3 w-3" /> {t('Đã ghim')}
              </Badge>
            )}
            {post.isAccepted && (
              <Badge tone="success">
                <CheckCircle2 className="h-3 w-3" /> {t('GV xác nhận')}
              </Badge>
            )}
            {hidden && <Badge tone="danger">{t('Đã ẩn')}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <time dateTime={toDate(post.createdAt)?.toISOString()}>{timeAgo(post.createdAt)}</time>
            {post.editedAt && ' · ' + t('đã sửa')}
            {author && (
              <span className="ml-2 font-medium text-fg">
                → {author.displayName} {author.studentId && `(${author.studentId})`}
              </span>
            )}
          </p>
        </div>
        {(staff || (ownPost && withinWindow && !post.isAiGenerated)) && (
          <Menu
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t('Thao tác')} disabled={busy}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          >
            {ownPost && withinWindow && (
              <>
                <MenuItem onSelect={() => { setEditText(post.content); setEditing(true); }}>
                  <Pencil className="h-4 w-4" /> {t('Sửa')}
                </MenuItem>
                <MenuItem danger onSelect={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> {t('Xóa')}
                </MenuItem>
              </>
            )}
            {staff && (
              <>
                {ownPost && withinWindow && <MenuSeparator />}
                {post.isRoot && (
                  <MenuItem onSelect={() => moderate({ isPinned: !post.isPinned }, post.isPinned ? t('Đã bỏ ghim') : t('Đã ghim'))}>
                    {post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {post.isPinned ? t('Bỏ ghim') : t('Ghim lên đầu')}
                  </MenuItem>
                )}
                {post.type === 'answer' && !post.isAiGenerated && (
                  <MenuItem onSelect={() => moderate({ isAccepted: !post.isAccepted }, post.isAccepted ? t('Đã bỏ xác nhận') : t('Đã xác nhận câu trả lời'))}>
                    <CheckCircle2 className="h-4 w-4" /> {post.isAccepted ? t('Bỏ xác nhận') : t('Xác nhận câu trả lời đúng')}
                  </MenuItem>
                )}
                {isQuestion &&
                  (['new', 'answered', 'need_clarification', 'resolved', 'archived'] as QuestionStatus[])
                    .filter((s) => s !== post.status)
                    .map((s) => (
                      <MenuItem key={s} onSelect={() => moderate({ status: s }, t('Đã chuyển: {{status}}', { status: t(QUESTION_STATUS_LABELS[s]) }))}>
                        <span className="h-4 w-4" /> {t('Đánh dấu: {{status}}', { status: t(QUESTION_STATUS_LABELS[s]) })}
                      </MenuItem>
                    ))}
                {isQuestion && onAskAi && (
                  <MenuItem onSelect={() => onAskAi(post)}>
                    <Sparkles className="h-4 w-4" /> {t('AI đề xuất trả lời')}
                  </MenuItem>
                )}
                {post.isAnonymous && revealAllowed && post.identityRevealable && (
                  <MenuItem onSelect={reveal}>
                    <UserSearch className="h-4 w-4" /> {t('Xem danh tính')}
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem danger={!hidden} onSelect={() => moderate({ moderationStatus: hidden ? 'visible' : 'hidden' }, hidden ? t('Đã hiện lại') : t('Đã ẩn bài'))}>
                  {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {hidden ? t('Hiện lại') : t('Ẩn bài')}
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </header>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={5000} aria-label={t('Sửa nội dung')} />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} loading={busy} disabled={!editText.trim()}>{t('Lưu')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('Hủy')}</Button>
          </div>
        </div>
      ) : (
        <div
          className={cn('mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed', onOpenThread && 'cursor-pointer')}
          onClick={onOpenThread}
        >
          {post.content}
        </div>
      )}

      {post.topics?.length > 0 && post.isRoot && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.topics.map((tp) => (
            <span key={tp} className="rounded-md bg-secondary-soft px-2 py-0.5 text-xs font-medium text-secondary">#{tp}</span>
          ))}
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {isQuestion && (
          <button
            onClick={() => react({ upvoted: !mine?.upvoted })}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
              mine?.upvoted ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:bg-slate-50',
            )}
            aria-pressed={!!mine?.upvoted}
            title={t('Bình chọn để giảng viên ưu tiên trả lời')}
          >
            <ChevronUp className="h-4 w-4" /> {post.voteCount}
            <span className="hidden sm:inline">{t('Muốn được trả lời')}</span>
          </button>
        )}
        {post.isRoot && onOpenThread && (
          <button onClick={onOpenThread} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted hover:bg-slate-50">
            <MessageSquare className="h-4 w-4" /> {t('{{n}} phản hồi', { n: post.replyCount })}
          </button>
        )}
        <Menu
          align="start"
          trigger={
            <button
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium',
                mine?.reaction ? 'border-secondary/40 bg-secondary-soft text-secondary' : 'border-border text-muted hover:bg-slate-50',
              )}
              aria-label={t('Phản hồi nhanh')}
            >
              {mine?.reaction ? <span aria-hidden>{REACTION_EMOJI[mine.reaction]}</span> : <Smile className="h-4 w-4" />}
              {mine?.reaction ? t(REACTION_LABELS[mine.reaction]) : t('Phản hồi nhanh')}
            </button>
          }
        >
          {REACTIONS.map((r) => (
            <MenuItem key={r} onSelect={() => react({ reaction: mine?.reaction === r ? null : r })}>
              <span aria-hidden>{REACTION_EMOJI[r]}</span> {t(REACTION_LABELS[r])}
              {mine?.reaction === r && <CheckCircle2 className="ml-auto h-4 w-4 text-secondary" />}
            </MenuItem>
          ))}
        </Menu>
        {topReactions.length > 0 && (
          <div className="ml-1 flex flex-wrap items-center gap-1 text-xs text-muted">
            {topReactions.map((r) => (
              <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5" title={t(REACTION_LABELS[r])}>
                {REACTION_EMOJI[r]} {counts[r]}
              </span>
            ))}
          </div>
        )}
        {canAskAiAsStudent && ownPost && isQuestion && onAskAi && (
          <Button size="sm" variant="ghost" className="ml-auto text-violet-700" onClick={() => onAskAi(post)}>
            <Sparkles className="h-4 w-4" /> {t('Hỏi AI')}
          </Button>
        )}
      </footer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('Xóa bài đăng?')}
        description={t('Bài sẽ bị ẩn khỏi lớp và không được tính vào thống kê.')}
        confirmLabel={t('Xóa')}
        danger
        loading={busy}
        onConfirm={remove}
      />
    </article>
  );
}
