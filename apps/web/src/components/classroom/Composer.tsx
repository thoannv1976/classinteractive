import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PostDoc, PostType } from '@classinteract/shared';
import { LIMITS } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useDraft } from '@/lib/drafts';
import { rememberMyPost } from '@/lib/myPosts';
import { cn, requestId } from '@/lib/utils';
import { tk } from '@/i18n';
import { similarQuestions } from './hooks';

interface SimilarItem {
  postId: string;
  sessionId: string;
  content: string;
  voteCount: number;
}
interface SimilarResp {
  method: 'embedding' | 'none';
  items: SimilarItem[];
}
const SEMANTIC_MIN_CHARS = 20;
const SEMANTIC_DEBOUNCE_MS = 1200;

const ROOT_TYPES: { value: PostType; label: string; placeholder: string }[] = [
  { value: 'question', label: tk('Câu hỏi'), placeholder: tk('Bạn muốn hỏi điều gì về bài học?') },
  { value: 'reflection', label: tk('Nhận xét'), placeholder: tk('Chia sẻ nhận xét, suy nghĩ của bạn…') },
  { value: 'discussion', label: tk('Thảo luận'), placeholder: tk('Nêu ý kiến thảo luận…') },
];

/** Post composer. Keeps a local draft and reuses the idempotency key on retries. */
export function Composer({
  classId,
  sessionId,
  topics,
  allowAnonymous,
  revealToStaff,
  disabled,
  disabledReason,
  existing,
  onPosted,
}: {
  classId: string;
  sessionId: string;
  topics: string[];
  allowAnonymous: boolean;
  /** Class lets lecturers see who wrote anonymous posts (shown to the author before sending). */
  revealToStaff?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  existing: PostDoc[];
  onPosted?: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<PostType>('question');
  const [content, setContent, clear] = useDraft(`post:${sessionId}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const pendingKey = useRef<string | null>(null);
  // Semantic duplicates from the server (embeddings); null = unavailable → local keyword heuristic.
  const [semantic, setSemantic] = useState<SimilarItem[] | null>(null);
  const latestCall = useRef(0);
  const semanticOff = useRef(false); // server said 'none' (AI or embeddings not configured): stop asking
  const draft = content.trim();
  const wantsSemantic = type === 'question' && draft.length >= SEMANTIC_MIN_CHARS;
  useEffect(() => {
    const call = ++latestCall.current;
    if (!wantsSemantic || semanticOff.current) return;
    const timer = setTimeout(() => {
      api
        .post<SimilarResp>(`/classes/${classId}/similar-questions`, { text: draft, sessionId })
        .then((r) => {
          if (r.method !== 'embedding') semanticOff.current = true;
          if (call === latestCall.current) setSemantic(r.method === 'embedding' ? r.items : null);
        })
        .catch(() => {
          if (call === latestCall.current) setSemantic(null);
        });
    }, SEMANTIC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [wantsSemantic, draft, classId, sessionId]);
  const similar: { postId: string; content: string; voteCount: number }[] =
    type !== 'question' || content.length <= 15 ? [] : wantsSemantic && semantic ? semantic : similarQuestions(content, existing);
  const cfg = ROOT_TYPES.find((rt) => rt.value === type)!;

  const submit = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    pendingKey.current ??= requestId();
    try {
      const r = await api.post<{ postId: string }>(`/classes/${classId}/sessions/${sessionId}/posts`, {
        type,
        content,
        topics: selected,
        isAnonymous: anon,
        clientRequestId: pendingKey.current,
      });
      pendingKey.current = null;
      rememberMyPost(r.postId);
      clear();
      setSelected([]);
      setSemantic(null);
      toast.success(type === 'question' ? t('Đã gửi câu hỏi') : t('Đã gửi'));
      onPosted?.();
    } catch (e) {
      // Network errors keep the same key so a retry cannot create a duplicate.
      if (!(e instanceof ApiError && e.status === 0)) pendingKey.current = null;
      toast.error(errorMessage(e) + (e instanceof ApiError && e.status === 0 ? ' ' + t('Bản nháp vẫn được giữ.') : ''));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)] sm:p-4">
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label={t('Loại bài đăng')}>
        {ROOT_TYPES.map((rt) => (
          <button
            key={rt.value}
            role="radio"
            aria-checked={type === rt.value}
            onClick={() => setType(rt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              type === rt.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {t(rt.label)}
          </button>
        ))}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={disabled ? disabledReason : t(cfg.placeholder)}
        disabled={disabled}
        maxLength={LIMITS.postContentMax}
        className="min-h-[72px] resize-y border-0 px-1 shadow-none focus:ring-0"
        aria-label={t(cfg.label)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {similar.length > 0 && (
        <div className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">{t('Có thể câu hỏi tương tự đã có:')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {similar.map((p) => (
              <li key={p.postId} className="line-clamp-1">
                {p.content} <span className="whitespace-nowrap text-amber-700">· ▲{p.voteCount}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1">{t('Bạn có thể bình chọn câu hỏi đó thay vì gửi câu mới.')}</p>
        </div>
      )}
      {topics.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label={t('Chủ đề')}>
          {topics.map((tp) => {
            const on = selected.includes(tp);
            return (
              <button
                key={tp}
                aria-pressed={on}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== tp) : s.length < 5 ? [...s, tp] : s))}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium',
                  on ? 'bg-secondary text-white' : 'bg-secondary-soft text-secondary hover:bg-teal-100',
                )}
              >
                #{tp}
              </button>
            );
          })}
        </div>
      )}
      {anon && (
        <p className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          {t('Tên bạn được ẩn với các bạn trong lớp.')}{' '}
          {revealToStaff ? t('Theo chính sách lớp, giảng viên vẫn có thể xem danh tính (mỗi lần xem được ghi nhật ký).') : t('Giảng viên cũng không thấy tên bạn.')} {t('Đóng góp vẫn được tính vào mức độ tham gia của bạn.')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        {allowAnonymous ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-4 w-4 rounded border-border-strong accent-primary" />
            {t('Gửi ẩn danh với các bạn trong lớp')}
          </label>
        ) : (
          <span className="text-xs text-muted">{content ? t('Bản nháp được tự động lưu') : t('Ctrl + Enter để gửi')}</span>
        )}
        <Button onClick={submit} loading={sending} disabled={disabled || !content.trim()} size="sm">
          <Send className="h-4 w-4" /> {t('Gửi')}
        </Button>
      </div>
    </div>
  );
}

/** Reply composer used in a thread. */
export function ReplyComposer({
  classId,
  sessionId,
  postId,
  allowAnonymous,
  disabled,
  disabledReason,
  defaultType = 'answer',
}: {
  classId: string;
  sessionId: string;
  postId: string;
  allowAnonymous: boolean;
  disabled?: boolean;
  disabledReason?: string;
  defaultType?: 'answer' | 'comment';
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<'answer' | 'comment'>(defaultType);
  const [content, setContent, clear] = useDraft(`reply:${postId}`);
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const pendingKey = useRef<string | null>(null);

  const submit = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    pendingKey.current ??= requestId();
    try {
      const r = await api.post<{ postId: string }>(`/classes/${classId}/sessions/${sessionId}/posts/${postId}/replies`, {
        type,
        content,
        isAnonymous: anon,
        clientRequestId: pendingKey.current,
      });
      pendingKey.current = null;
      rememberMyPost(r.postId);
      clear();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 0)) pendingKey.current = null;
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex gap-1">
        {(['answer', 'comment'] as const).map((rt) => (
          <button
            key={rt}
            onClick={() => setType(rt)}
            aria-pressed={type === rt}
            className={cn('rounded-full px-3 py-1 text-xs font-medium', type === rt ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}
          >
            {rt === 'answer' ? t('Trả lời') : t('Bình luận')}
          </button>
        ))}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={disabled ? disabledReason : type === 'answer' ? t('Viết câu trả lời…') : t('Bổ sung ý kiến…')}
        disabled={disabled}
        maxLength={LIMITS.postContentMax}
        className="min-h-[64px] border-0 px-1 shadow-none focus:ring-0"
        aria-label={t('Nội dung phản hồi')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        {allowAnonymous ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-4 w-4 accent-primary" />
            {t('Ẩn danh')}
          </label>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={submit} loading={sending} disabled={disabled || !content.trim()}>
          <Send className="h-4 w-4" /> {t('Gửi')}
        </Button>
      </div>
    </div>
  );
}
