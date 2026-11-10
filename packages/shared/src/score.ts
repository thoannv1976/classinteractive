import type { ScoreComponent } from './constants';
import type { ScoreConfig } from './types';

/**
 * Engagement score (0–100), computed from real opportunities only.
 * - activities: activities completed / activities opened (exit tickets excluded – own component)
 * - answers:    answers + comments + reflections, at most `caps.answers` per session
 * - questions:  questions, at most `caps.questions` per session
 * - helpful:    answers confirmed by the lecturer, at most `caps.helpful` per session
 * - exitTickets: exit tickets submitted / exit tickets opened
 * A component without any opportunity is left out and the other weights are re-normalised,
 * so a session without activities never lowers anyone's score.
 */
export const DEFAULT_SCORE_CONFIG: Omit<ScoreConfig, 'createdBy' | 'createdAt'> = {
  version: 1,
  weights: { activities: 30, answers: 25, questions: 20, helpful: 15, exitTickets: 10 },
  caps: { answers: 3, questions: 2, helpful: 2 },
  basis: 'held',
};

export interface ScoreSession {
  sessionId: string;
  activityCount: number;
  exitTicketCount: number;
}

export interface ScoreStudentInput {
  /** per-session counters of the student */
  perSession: Record<string, { joined: boolean; questions: number; answers: number; comments: number; reflections: number }>;
  activitiesCompleted: number;
  exitTickets: number;
  acceptedAnswers: number;
  adjustment?: number;
}

export interface ComponentResult {
  value: number | null; // 0..1, null = no opportunity
  done: number;
  possible: number;
}

export interface ScoreResult {
  components: Record<ScoreComponent, ComponentResult>;
  raw: number | null;
  adjustment: number;
  score: number | null;
  sessionsCounted: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

export function computeScore(cfg: Pick<ScoreConfig, 'weights' | 'caps' | 'basis'>, heldSessions: ScoreSession[], s: ScoreStudentInput): ScoreResult {
  const sessions = cfg.basis === 'attended' ? heldSessions.filter((x) => s.perSession[x.sessionId]?.joined) : heldSessions;
  const n = sessions.length;
  const per = (id: string) => s.perSession[id] ?? { joined: false, questions: 0, answers: 0, comments: 0, reflections: 0 };

  const actPossible = sessions.reduce((sum, x) => sum + Math.max(0, x.activityCount - x.exitTicketCount), 0);
  const actDone = Math.min(actPossible, Math.max(0, s.activitiesCompleted - s.exitTickets));
  const exitPossible = sessions.reduce((sum, x) => sum + x.exitTicketCount, 0);
  const exitDone = Math.min(exitPossible, s.exitTickets);
  const ansDone = sessions.reduce((sum, x) => {
    const p = per(x.sessionId);
    return sum + Math.min(cfg.caps.answers, p.answers + p.comments + p.reflections);
  }, 0);
  const qDone = sessions.reduce((sum, x) => sum + Math.min(cfg.caps.questions, per(x.sessionId).questions), 0);
  const helpPossible = cfg.caps.helpful * n;
  const helpDone = Math.min(helpPossible, s.acceptedAnswers);

  const comp = (done: number, possible: number): ComponentResult => ({ value: possible > 0 ? clamp01(done / possible) : null, done, possible });
  const components: Record<ScoreComponent, ComponentResult> = {
    activities: comp(actDone, actPossible),
    answers: comp(ansDone, cfg.caps.answers * n),
    questions: comp(qDone, cfg.caps.questions * n),
    helpful: comp(helpDone, helpPossible),
    exitTickets: comp(exitDone, exitPossible),
  };
  let wsum = 0;
  let acc = 0;
  for (const k of Object.keys(components) as ScoreComponent[]) {
    const v = components[k].value;
    const w = cfg.weights[k];
    if (v === null || w <= 0) continue;
    wsum += w;
    acc += w * v;
  }
  const raw = wsum > 0 ? round1((acc / wsum) * 100) : null;
  const adjustment = s.adjustment ?? 0;
  const score = raw === null ? null : round1(Math.max(0, Math.min(100, raw + adjustment)));
  return { components, raw, adjustment, score, sessionsCounted: n };
}

export interface ScoreTip {
  component: ScoreComponent;
  /** Points (on the 0–100 scale) the student would gain by completing this component fully. */
  gain: number;
  done: number;
  possible: number;
}

/**
 * Where a student can still raise the score, biggest gain first.
 * Components already at 100%, without any opportunity, or weighted 0 are left out.
 * The gain uses the same re-normalised weights as `computeScore`, so the tips add up to 100 − raw.
 */
export function scoreTips(cfg: Pick<ScoreConfig, 'weights'>, r: Pick<ScoreResult, 'components'>): ScoreTip[] {
  const keys = Object.keys(r.components) as ScoreComponent[];
  const wsum = keys.reduce((sum, k) => (r.components[k].value === null || cfg.weights[k] <= 0 ? sum : sum + cfg.weights[k]), 0);
  if (wsum <= 0) return [];
  return keys
    .flatMap((k) => {
      const c = r.components[k];
      const w = cfg.weights[k];
      if (c.value === null || w <= 0 || c.value >= 1) return [];
      return [{ component: k, gain: round1((w / wsum) * (1 - c.value) * 100), done: c.done, possible: c.possible }];
    })
    .sort((a, b) => b.gain - a.gain);
}
