import type { SessionDoc } from '@classinteract/shared';
import { toMillis } from './time';

/**
 * Of the open/paused sessions of a class, the one a student arriving from the LMS should land in:
 * open before paused, then the most recently started (then the highest session number).
 */
export function pickLaunchSession<T extends Pick<SessionDoc, 'sessionId' | 'status' | 'startedAt' | 'sessionNumber'>>(sessions: T[]): T | null {
  const rank = (s: T) => (s.status === 'open' ? 1 : 0);
  return (
    [...sessions].sort(
      (a, b) => rank(b) - rank(a) || (toMillis(b.startedAt) ?? 0) - (toMillis(a.startedAt) ?? 0) || b.sessionNumber - a.sessionNumber,
    )[0] ?? null
  );
}
