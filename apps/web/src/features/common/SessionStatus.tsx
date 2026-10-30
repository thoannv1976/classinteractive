import type { SessionDoc, SessionStatus } from '@classinteract/shared';
import { useTranslation } from 'react-i18next';
import { SESSION_STATUS_LABELS } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import i18n from '@/i18n';

const TONE: Record<SessionStatus, 'success' | 'warning' | 'neutral' | 'primary'> = {
  draft: 'neutral',
  open: 'success',
  paused: 'warning',
  closed: 'primary',
  archived: 'neutral',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONE[status]}>
      {status === 'open' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />}
      {t(SESSION_STATUS_LABELS[status])}
    </Badge>
  );
}

export const sessionLabel = (s: Pick<SessionDoc, 'sessionNumber' | 'title'>) =>
  i18n.t('Buổi {{n}}: {{title}}', { n: String(s.sessionNumber).padStart(2, '0'), title: s.title });
export const sessionTime = (s: Pick<SessionDoc, 'date' | 'plannedStart' | 'plannedEnd'>) => `${formatDate(s.date)} · ${s.plannedStart}–${s.plannedEnd}`;
