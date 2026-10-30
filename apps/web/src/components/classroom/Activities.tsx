import { collection, orderBy, query } from 'firebase/firestore';
import { CheckCircle2, Eye, EyeOff, Lock, Play, Plus, Star, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ActivityDoc, ActivityResultsDoc, ActivityType, SubmissionDoc } from '@classinteract/shared';
import { ACTIVITY_STATUS_LABELS, ACTIVITY_TYPE_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery, useOnceDoc } from '@/lib/firestore';
import { cn, requestId, timeAgo } from '@/lib/utils';
import { tk } from '@/i18n';
import { sessionPath } from './hooks';

const actPath = (classId: string, sessionId: string, a: ActivityDoc) => `${sessionPath(classId, sessionId)}/activities/${a.activityId}`;
const apiPath = (classId: string, sessionId: string, a: ActivityDoc) => `/classes/${classId}/sessions/${sessionId}/activities/${a.activityId}`;

/** Horizontal result bars (used in session, presenter mode and reports). */
export function ResultBars({ activity, results, large }: { activity: ActivityDoc; results: ActivityResultsDoc | null; large?: boolean }) {
  const { t } = useTranslation();
  const total = results?.submissionCount ?? 0;
  const correct = new Set(activity.revealedCorrectOptionIds ?? []);
  const colors = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-600', 'bg-lime-600', 'bg-fuchsia-600', 'bg-slate-500'];
  return (
    <div className={cn('space-y-2', large && 'space-y-4')}>
      {activity.options.map((o, i) => {
        const n = results?.optionCounts?.[o.id] ?? 0;
        const p = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={o.id}>
            <div className={cn('mb-1 flex items-center justify-between gap-3 text-sm', large && 'text-2xl')}>
              <span className={cn('flex items-center gap-1.5', correct.has(o.id) && 'font-semibold text-success')}>
                {correct.has(o.id) && <CheckCircle2 className={cn('h-4 w-4', large && 'h-7 w-7')} />}
                {activity.type === 'understanding' ? t(o.label) : o.label}
              </span>
              <span className="tabular-nums text-muted">
                {n} · {p}%
              </span>
            </div>
            <div className={cn('h-2.5 overflow-hidden rounded-full bg-slate-100', large && 'h-6')}>
              <div className={cn('h-full rounded-full transition-all duration-500', colors[i % colors.length])} style={{ width: `${p}%` }} />
            </div>
          </div>
        );
      })}
      <p className={cn('text-xs text-muted', large && 'text-lg')}>{t('{{n}} lượt trả lời', { n: total })}</p>
    </div>
  );
}

function ActivityHeader({ a }: { a: ActivityDoc }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={a.type === 'quiz' ? 'accent' : a.type === 'understanding' ? 'secondary' : 'primary'}>{t(ACTIVITY_TYPE_LABELS[a.type])}</Badge>
      <Badge tone={a.status === 'open' ? 'success' : a.status === 'draft' ? 'neutral' : 'warning'}>
        {a.status === 'open' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />}
        {t(ACTIVITY_STATUS_LABELS[a.status])}
      </Badge>
    </div>
  );
}

/** Student view: answer an activity (and change the answer while it is open). */
export function StudentActivityCard({ classId, sessionId, activity: a, canSubmit }: { classId: string; sessionId: string; activity: ActivityDoc; canSubmit: boolean }) {
  const me = useMe();
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const [mine] = useOnceDoc<SubmissionDoc>(`${actPath(classId, sessionId, a)}/submissions/${me.uid}`, version);
  const results = useLiveDoc<ActivityResultsDoc>(a.showResults ? `${actPath(classId, sessionId, a)}/results/summary` : null);
  const [choice, setChoice] = useState<string[] | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const selected = choice ?? mine?.optionIds ?? [];
  const answer = text ?? mine?.text ?? '';
  const open = a.status === 'open' && canSubmit;
  const correct = new Set(a.revealedCorrectOptionIds ?? []);

  const submit = async (optionIds = selected) => {
    setSending(true);
    try {
      await api.post(`${apiPath(classId, sessionId, a)}/submissions`, { optionIds, text: answer, clientRequestId: requestId() });
      toast.success(t('Đã gửi câu trả lời'));
      setChoice(null);
      setText(null);
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const toggle = (id: string) => {
    if (a.allowMultiple) setChoice(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else setChoice([id]);
  };

  return (
    <div className={cn('rounded-xl border bg-surface p-4 shadow-[var(--shadow-card)]', a.status === 'open' ? 'border-primary/40' : 'border-border')}>
      <ActivityHeader a={a} />
      <h3 className="mt-2 font-semibold">{a.title}</h3>
      {a.prompt && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.prompt}</p>}
      {mine && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> {t('Bạn đã trả lời {{time}}', { time: timeAgo(mine.updatedAt) })}{open && ' · ' + t('có thể đổi câu trả lời')}
        </p>
      )}
      <div className="mt-3">
        {a.type === 'free_text' ? (
          <div className="space-y-2">
            <Textarea value={answer} onChange={(e) => setText(e.target.value)} disabled={!open} placeholder={t('Nhập câu trả lời của bạn…')} maxLength={3000} aria-label={t('Câu trả lời')} />
            {open && (
              <Button size="sm" onClick={() => submit([])} loading={sending} disabled={!answer.trim() || answer === mine?.text}>
                {mine ? t('Cập nhật') : t('Gửi')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2" role={a.allowMultiple ? 'group' : 'radiogroup'}>
            {a.options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  disabled={!open || sending}
                  role={a.allowMultiple ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  onClick={() => {
                    if (a.type === 'understanding') void submit([o.id]);
                    else toggle(o.id);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default',
                    on ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-slate-50',
                    correct.has(o.id) && 'border-green-400 bg-green-50 text-success',
                  )}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border-2', a.allowMultiple ? 'rounded' : 'rounded-full', on ? 'border-primary bg-primary' : 'border-border-strong')}>
                    {on && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  {a.type === 'understanding' ? t(o.label) : o.label}
                </button>
              );
            })}
            {open && a.type !== 'understanding' && (
              <Button size="sm" onClick={() => submit()} loading={sending} disabled={!selected.length || (mine !== null && JSON.stringify([...selected].sort()) === JSON.stringify([...mine.optionIds].sort()))}>
                {mine ? t('Đổi câu trả lời') : t('Gửi')}
              </Button>
            )}
          </div>
        )}
      </div>
      {a.showResults && a.type !== 'free_text' && results.data && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted">{t('Kết quả của lớp')}</p>
          <ResultBars activity={a} results={results.data} />
        </div>
      )}
      {a.status === 'closed' && !mine && <p className="mt-3 text-xs text-muted">{t('Hoạt động đã đóng.')}</p>}
    </div>
  );
}

/** Lecturer view of one activity with live results and controls. */
export function StaffActivityCard({ classId, sessionId, activity: a, onPresent }: { classId: string; sessionId: string; activity: ActivityDoc; onPresent?: () => void }) {
  const { t } = useTranslation();
  const base = apiPath(classId, sessionId, a);
  const results = useLiveDoc<ActivityResultsDoc>(`${actPath(classId, sessionId, a)}/results/summary`);
  const subsQ = useMemo(
    () => (a.type === 'free_text' ? query(collection(db, actPath(classId, sessionId, a), 'submissions'), orderBy('submittedAt', 'desc')) : null),
    [classId, sessionId, a],
  );
  const subs = useLiveQuery<SubmissionDoc>(subsQ);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const call = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const total = results.data?.submissionCount ?? 0;

  return (
    <div className={cn('rounded-xl border bg-surface p-4 shadow-[var(--shadow-card)]', a.status === 'open' ? 'border-primary/40' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <ActivityHeader a={a} />
          <h3 className="mt-2 font-semibold">{a.title}</h3>
          {a.prompt && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.prompt}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {a.status !== 'open' && (
            <Button size="sm" variant="secondary" onClick={() => call(() => api.post(`${base}/open`), t('Đã mở hoạt động'))} loading={busy}>
              <Play className="h-4 w-4" /> {a.status === 'draft' ? t('Mở') : t('Mở lại')}
            </Button>
          )}
          {a.status === 'open' && (
            <Button size="sm" variant="outline" onClick={() => call(() => api.post(`${base}/close`), t('Đã đóng hoạt động'))} loading={busy}>
              <Lock className="h-4 w-4" /> {t('Đóng')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title={a.showResults ? t('Ẩn kết quả với sinh viên') : t('Hiện kết quả cho sinh viên')}
            onClick={() => call(() => api.patch(base, { showResults: !a.showResults }))}
          >
            {a.showResults ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{a.showResults ? t('SV thấy kết quả') : t('Ẩn kết quả')}</span>
          </Button>
          {a.type === 'quiz' && a.status === 'closed' && (
            <Button size="sm" variant="ghost" onClick={() => call(() => api.patch(base, { revealAnswer: !a.revealedCorrectOptionIds }), a.revealedCorrectOptionIds ? t('Đã ẩn đáp án') : t('Đã công bố đáp án'))}>
              <Trophy className="h-4 w-4" /> {a.revealedCorrectOptionIds ? t('Ẩn đáp án') : t('Công bố đáp án')}
            </Button>
          )}
          {onPresent && (
            <Button size="sm" variant="ghost" onClick={onPresent}>
              {t('Trình chiếu')}
            </Button>
          )}
          {!a.openedAt && (
            <Button size="icon-sm" variant="ghost" aria-label={t('Xóa')} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4">
        {a.type === 'free_text' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">{t('{{n}} câu trả lời · đánh dấu sao để hiển thị trên màn hình trình chiếu', { n: total })}</p>
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {subs.data.map((s) => (
                <li key={s.uid} className={cn('rounded-lg border px-3 py-2 text-sm', s.featured ? 'border-amber-300 bg-amber-50' : 'border-border')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">{s.displayName} · {s.studentId}</span>
                    <button
                      onClick={() => call(() => api.post(`${base}/submissions/${s.uid}/feature`, { featured: !s.featured }))}
                      aria-label={s.featured ? t('Bỏ nổi bật') : t('Đánh dấu nổi bật')}
                      className="text-amber-500"
                    >
                      <Star className={cn('h-4 w-4', s.featured && 'fill-amber-400')} />
                    </button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <ResultBars activity={a} results={results.data} />
            {a.type === 'quiz' && total > 0 && (
              <p className="mt-2 text-sm font-medium text-success">
                {t('Tỷ lệ đúng: {{pct}}% ({{correct}}/{{total}})', { pct: Math.round(((results.data?.correctCount ?? 0) / total) * 100), correct: results.data?.correctCount ?? 0, total })}
              </p>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('Xóa hoạt động nháp?')}
        danger
        confirmLabel={t('Xóa')}
        loading={busy}
        onConfirm={() => call(() => api.del(base), t('Đã xóa')).then(() => setConfirmDelete(false))}
      />
    </div>
  );
}

const PRESETS: { key: string; label: string; type: ActivityType; title: string; prompt: string; options: string[] }[] = [
  { key: 'understanding', label: tk('Kiểm tra mức độ hiểu (1 chạm)'), type: 'understanding', title: tk('Bạn đã hiểu nội dung này chưa?'), prompt: '', options: [] },
  { key: 'poll', label: tk('Khảo sát ý kiến'), type: 'poll', title: '', prompt: '', options: ['', ''] },
  { key: 'quiz', label: tk('Trắc nghiệm nhanh'), type: 'quiz', title: '', prompt: '', options: ['', '', '', ''] },
  { key: 'free_text', label: tk('Trả lời tự do'), type: 'free_text', title: '', prompt: '', options: [] },
  {
    key: 'exit',
    label: tk('Phiếu cuối buổi (Exit ticket)'),
    type: 'free_text',
    title: tk('Phiếu cuối buổi'),
    prompt: tk('1. Hôm nay bạn học được điều gì quan trọng nhất?\n2. Bạn còn chưa hiểu vấn đề nào?\n3. Bạn muốn tìm hiểu thêm nội dung gì?'),
    options: [],
  },
];

export function ActivityCreator({ open, onOpenChange, classId, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; classId: string; sessionId: string }) {
  const { t } = useTranslation();
  const tr = (s: string) => (s ? t(s) : s);
  const [preset, setPreset] = useState(PRESETS[0]!);
  const [title, setTitle] = useState(() => tr(PRESETS[0]!.title));
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [correct, setCorrect] = useState<number[]>([]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [openNow, setOpenNow] = useState(true);
  const [saving, setSaving] = useState(false);

  const choose = (p: (typeof PRESETS)[number]) => {
    setPreset(p);
    setTitle(tr(p.title));
    setPrompt(tr(p.prompt));
    setOptions([...p.options]);
    setCorrect([]);
    setAllowMultiple(false);
    setShowResults(p.type !== 'quiz');
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/classes/${classId}/sessions/${sessionId}/activities`, {
        type: preset.type,
        title,
        prompt,
        options: options.map((o) => o.trim()).filter(Boolean),
        correctOptionIndexes: correct,
        allowMultiple,
        showResults,
        openNow,
      });
      toast.success(openNow ? t('Đã mở hoạt động cho sinh viên') : t('Đã lưu nháp hoạt động'));
      onOpenChange(false);
      choose(PRESETS[0]!);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const hasOptions = preset.type === 'poll' || preset.type === 'quiz';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t('Tạo hoạt động')}
      description={t('Sinh viên trả lời ngay trên điện thoại, kết quả cập nhật trực tiếp.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Hủy')}</Button>
          <Button onClick={save} loading={saving} disabled={!title.trim()}>
            {openNow ? t('Tạo và mở ngay') : t('Lưu nháp')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => choose(p)}
              className={cn('rounded-lg border px-3 py-2 text-left text-sm', preset.key === p.key ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-slate-50')}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        <Field label={t('Câu hỏi / yêu cầu')} htmlFor="act-title">
          <Input id="act-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('VD: Hãy nêu ba lợi ích của mô hình kinh doanh nền tảng số')} />
        </Field>
        <Field label={t('Mô tả thêm (không bắt buộc)')} htmlFor="act-prompt">
          <Textarea id="act-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={3000} />
        </Field>
        {hasOptions && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('Phương án')}{preset.type === 'quiz' && ' ' + t('(đánh dấu đáp án đúng)')}</p>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                {preset.type === 'quiz' && (
                  <input
                    type="checkbox"
                    aria-label={t('Đáp án đúng {{n}}', { n: i + 1 })}
                    checked={correct.includes(i)}
                    onChange={(e) => setCorrect((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))}
                    className="h-5 w-5 accent-green-600"
                  />
                )}
                <Input value={o} onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} placeholder={t('Phương án {{letter}}', { letter: String.fromCharCode(65 + i) })} maxLength={300} />
                {options.length > 2 && (
                  <Button variant="ghost" size="icon-sm" aria-label={t('Xóa phương án')} onClick={() => { setOptions((arr) => arr.filter((_, j) => j !== i)); setCorrect((c) => c.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button variant="outline" size="sm" onClick={() => setOptions((o) => [...o, ''])}>
                <Plus className="h-4 w-4" /> {t('Thêm phương án')}
              </Button>
            )}
            {preset.type === 'poll' && <Switch id="multi" checked={allowMultiple} onCheckedChange={setAllowMultiple} label={t('Cho phép chọn nhiều phương án')} />}
          </div>
        )}
        <div className="space-y-3 rounded-lg bg-surface-2 p-3">
          {preset.type !== 'free_text' && (
            <Switch id="show" checked={showResults} onCheckedChange={setShowResults} label={t('Sinh viên thấy kết quả tổng hợp')} description={t('Có thể bật/tắt sau.')} />
          )}
          <Switch id="now" checked={openNow} onCheckedChange={setOpenNow} label={t('Mở ngay cho sinh viên')} />
        </div>
      </div>
    </Dialog>
  );
}

export function NoActivities({ staff, onCreate }: { staff: boolean; onCreate?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('Chưa có hoạt động')}
      description={staff ? t('Tạo khảo sát, trắc nghiệm nhanh hoặc câu hỏi trả lời tự do cho cả lớp.') : t('Khi giảng viên mở hoạt động, bạn sẽ thấy ở đây.')}
      action={
        staff && onCreate ? (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" /> {t('Tạo hoạt động')}
          </Button>
        ) : undefined
      }
    />
  );
}
