import { collection, limit, orderBy, query } from 'firebase/firestore';
import { CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AiJobDoc, AiJobType } from '@classinteract/shared';
import { AI_JOB_STATUS_LABELS, AI_JOB_TYPE_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/firestore';
import { timeAgo } from '@/lib/utils';

/** Latest background AI jobs of a class (realtime; class staff only). */
export function useClassJobs(classId: string) {
  const q = useMemo(() => query(collection(db, 'classes', classId, 'aiJobs'), orderBy('createdAt', 'desc'), limit(30)), [classId]);
  return useLiveQuery<AiJobDoc>(q);
}

/** Most recent job of a type (optionally for a session / activity). */
export function useLatestJob(classId: string, type: AiJobType, sessionId?: string | null, activityId?: string) {
  const { data } = useClassJobs(classId);
  return data.find((j) => j.type === type && (sessionId === undefined || (j.sessionId ?? null) === (sessionId ?? null)) && (!activityId || j.params?.activityId === activityId)) ?? null;
}

export function JobStatusBadge({ job }: { job: AiJobDoc }) {
  const { t } = useTranslation();
  const tone = job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'primary';
  return (
    <Badge tone={tone} title={job.error ?? undefined}>
      {(job.status === 'queued' || job.status === 'running') && <Loader2 className="h-3 w-3 animate-spin" />}
      {job.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
      {job.status === 'failed' && <XCircle className="h-3 w-3" />}
      {t(AI_JOB_STATUS_LABELS[job.status])}
    </Badge>
  );
}

/**
 * Starts a background AI job and follows it until it finishes.
 * `onDone` is called once when the job completes (also for jobs started elsewhere).
 */
export function AiJobButton({
  classId,
  type,
  sessionId,
  activityId,
  force,
  label,
  onDone,
  size,
  variant = 'soft',
  className,
  disabled,
}: {
  classId: string;
  type: AiJobType;
  sessionId?: string | null;
  activityId?: string;
  force?: boolean;
  label?: string;
  onDone?: (job: AiJobDoc) => void;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const job = useLatestJob(classId, type, sessionId, activityId);
  const [starting, setStarting] = useState(false);
  const [mine, setMine] = useState<string | null>(null);
  const reported = useRef<string | null>(null);
  const running = job && (job.status === 'queued' || job.status === 'running');

  useEffect(() => {
    if (!job || job.status === 'queued' || job.status === 'running' || reported.current === job.jobId) return;
    reported.current = job.jobId;
    if (job.jobId !== mine) return; // only toast for jobs started from this button
    if (job.status === 'completed') {
      toast.success(t('{{task}}: hoàn tất', { task: t(AI_JOB_TYPE_LABELS[job.type]) }));
      onDone?.(job);
    } else toast.error(`${t(AI_JOB_TYPE_LABELS[job.type])}: ${job.error ?? ''}`);
  }, [job, mine, onDone, t]);

  const start = async () => {
    setStarting(true);
    try {
      const j = await api.post<AiJobDoc>(`/classes/${classId}/ai-jobs`, { type, sessionId: sessionId ?? undefined, activityId, force });
      setMine(j.jobId);
      reported.current = null;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant={variant} size={size} className={className} onClick={start} loading={starting || !!running} disabled={disabled || !!running}>
        {!starting && !running && <Sparkles className="h-4 w-4" />}
        {running ? (job.progress ? `${t('Đang xử lý…')} ${job.progress}` : t('Đang xử lý…')) : (label ?? t(AI_JOB_TYPE_LABELS[type]))}
      </Button>
      {job && !running && (
        <span className="text-xs text-muted">
          {job.status === 'failed' ? <span className="text-danger">{t('Lần chạy gần nhất bị lỗi')}</span> : t('Lần chạy gần nhất: {{time}}', { time: timeAgo(job.completedAt) })}
        </span>
      )}
    </span>
  );
}
