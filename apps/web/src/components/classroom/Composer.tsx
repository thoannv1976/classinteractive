import { Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PostDoc, PostType } from '@classinteract/shared';
import { LIMITS } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useDraft } from '@/lib/drafts';
import { cn, requestId } from '@/lib/utils';
import { similarQuestions } from './hooks';

const ROOT_TYPES: { value: PostType; label: string; placeholder: string }[] = [
  { value: 'question', label: 'Câu hỏi', placeholder: 'Bạn muốn hỏi điều gì về bài học?' },
  { value: 'reflection', label: 'Nhận xét', placeholder: 'Chia sẻ nhận xét, suy nghĩ của bạn…' },
  { value: 'discussion', label: 'Thảo luận', placeholder: 'Nêu ý kiến thảo luận…' },
];

/** Post composer. Keeps a local draft and reuses the idempotency key on retries. */
export function Composer({
  classId,
  sessionId,
  topics,
  allowAnonymous,
  disabled,
  disabledReason,
  existing,
  onPosted,
}: {
  classId: string;
  sessionId: string;
  topics: string[];
  allowAnonymous: boolean;
  disabled?: boolean;
  disabledReason?: string;
  existing: PostDoc[];
  onPosted?: () => void;
}) {
  const [type, setType] = useState<PostType>('question');
  const [content, setContent, clear] = useDraft(`post:${sessionId}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const similar = type === 'question' && content.length > 15 ? similarQuestions(content, existing) : [];
  const cfg = ROOT_TYPES.find((t) => t.value === type)!;

  const submit = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    pendingKey.current ??= requestId();
    try {
      await api.post(`/classes/${classId}/sessions/${sessionId}/posts`, {
        type,
        content,
        topics: selected,
        isAnonymous: anon,
        clientRequestId: pendingKey.current,
      });
      pendingKey.current = null;
      clear();
      setSelected([]);
      toast.success(type === 'question' ? 'Đã gửi câu hỏi' : 'Đã gửi');
      onPosted?.();
    } catch (e) {
      // Network errors keep the same key so a retry cannot create a duplicate.
      if (!(e instanceof ApiError && e.status === 0)) pendingKey.current = null;
      toast.error(errorMessage(e) + (e instanceof ApiError && e.status === 0 ? ' Bản nháp vẫn được giữ.' : ''));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)] sm:p-4">
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Loại bài đăng">
        {ROOT_TYPES.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              type === t.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={disabled ? disabledReason : cfg.placeholder}
        disabled={disabled}
        maxLength={LIMITS.postContentMax}
        className="min-h-[72px] resize-y border-0 px-1 shadow-none focus:ring-0"
        aria-label={cfg.label}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {similar.length > 0 && (
        <div className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">Có thể câu hỏi tương tự đã có:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {similar.map((p) => (
              <li key={p.postId} className="line-clamp-1">{p.content}</li>
            ))}
          </ul>
          <p className="mt-1">Bạn có thể bình chọn câu hỏi đó thay vì gửi câu mới.</p>
        </div>
      )}
      {topics.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Chủ đề">
          {topics.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                aria-pressed={on}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== t) : s.length < 5 ? [...s, t] : s))}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium',
                  on ? 'bg-secondary text-white' : 'bg-secondary-soft text-secondary hover:bg-teal-100',
                )}
              >
                #{t}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        {allowAnonymous ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-4 w-4 rounded border-border-strong accent-primary" />
            Gửi ẩn danh với các bạn trong lớp
          </label>
        ) : (
          <span className="text-xs text-muted">{content ? 'Bản nháp được tự động lưu' : 'Ctrl + Enter để gửi'}</span>
        )}
        <Button onClick={submit} loading={sending} disabled={disabled || !content.trim()} size="sm">
          <Send className="h-4 w-4" /> Gửi
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
      await api.post(`/classes/${classId}/sessions/${sessionId}/posts/${postId}/replies`, {
        type,
        content,
        isAnonymous: anon,
        clientRequestId: pendingKey.current,
      });
      pendingKey.current = null;
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
        {(['answer', 'comment'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={cn('rounded-full px-3 py-1 text-xs font-medium', type === t ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}
          >
            {t === 'answer' ? 'Trả lời' : 'Bình luận'}
          </button>
        ))}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={disabled ? disabledReason : type === 'answer' ? 'Viết câu trả lời…' : 'Bổ sung ý kiến…'}
        disabled={disabled}
        maxLength={LIMITS.postContentMax}
        className="min-h-[64px] border-0 px-1 shadow-none focus:ring-0"
        aria-label="Nội dung phản hồi"
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
            Ẩn danh
          </label>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={submit} loading={sending} disabled={disabled || !content.trim()}>
          <Send className="h-4 w-4" /> Gửi
        </Button>
      </div>
    </div>
  );
}
