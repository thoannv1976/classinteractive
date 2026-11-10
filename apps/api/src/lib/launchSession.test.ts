import { describe, expect, it } from 'vitest';
import { pickLaunchSession } from './launchSession';

const s = (sessionId: string, status: 'open' | 'paused', startedAt: string, sessionNumber: number) => ({ sessionId, status, startedAt: startedAt as never, sessionNumber });

describe('pickLaunchSession', () => {
  it('lands in the most recently started open session, not an old one left open', () => {
    const pick = pickLaunchSession([s('ch1', 'open', '2026-11-03T05:15:00Z', 1), s('ch3', 'open', '2026-11-10T05:15:00Z', 3), s('ch2', 'open', '2026-11-05T07:30:00Z', 2)]);
    expect(pick?.sessionId).toBe('ch3');
  });

  it('prefers an open session over a paused one, and falls back to paused', () => {
    expect(pickLaunchSession([s('p', 'paused', '2026-11-10T05:00:00Z', 4), s('o', 'open', '2026-11-03T05:00:00Z', 1)])?.sessionId).toBe('o');
    expect(pickLaunchSession([s('p', 'paused', '2026-11-10T05:00:00Z', 4)])?.sessionId).toBe('p');
    expect(pickLaunchSession([])).toBeNull();
  });
});
