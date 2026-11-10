import type { ScoreConfig } from './types';

/**
 * Personal achievements and class goals (gamification without a public individual ranking).
 * Every badge mirrors something the participation score already rewards, so chasing badges
 * means taking part the way the course wants – never spamming.
 */

export const BADGE_IDS = ['first_step', 'curious', 'helper', 'recognized', 'all_activities', 'reflective', 'regular'] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeResult {
  id: BadgeId;
  earned: boolean;
  current: number;
  target: number;
}

export interface AchievementInput {
  /** Sessions held so far, oldest first. */
  sessions: Array<{ joined: boolean; questions: number; contributions: number }>;
  caps: ScoreConfig['caps'];
  acceptedAnswers: number;
  activities: { done: number; possible: number };
  exitTickets: { done: number; possible: number };
}

/** Sessions needed for the "per session" badges (full questions / full answers in N sessions). */
export const BADGE_SESSIONS = 3;

export function computeStreak(sessions: Array<{ joined: boolean }>) {
  let best = 0;
  let run = 0;
  for (const s of sessions) {
    run = s.joined ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

export function computeBadges(i: AchievementInput): BadgeResult[] {
  const joined = i.sessions.filter((s) => s.joined).length;
  const fullQuestions = i.sessions.filter((s) => s.questions >= i.caps.questions).length;
  const fullAnswers = i.sessions.filter((s) => s.contributions >= i.caps.answers).length;
  const held = i.sessions.length;
  const b = (id: BadgeId, current: number, target: number, earned = current >= target): BadgeResult => ({
    id,
    earned: earned && target > 0,
    current: Math.min(current, target),
    target,
  });
  return [
    b('first_step', joined, 1),
    b('curious', fullQuestions, BADGE_SESSIONS),
    b('helper', fullAnswers, BADGE_SESSIONS),
    b('recognized', i.acceptedAnswers, 1),
    // "Never missed an activity": needs a few activities to mean something.
    b('all_activities', i.activities.done, Math.max(3, i.activities.possible), i.activities.possible >= 3 && i.activities.done >= i.activities.possible),
    b('reflective', i.exitTickets.done, Math.max(2, i.exitTickets.possible), i.exitTickets.possible >= 2 && i.exitTickets.done >= i.exitTickets.possible),
    b('regular', joined, Math.max(3, held), held >= 3 && joined >= held),
  ];
}

/** Round class milestones; the goal is always the next one above the current count. */
export const CLASS_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000];

export function nextMilestone(count: number) {
  const target = CLASS_MILESTONES.find((m) => m > count) ?? Math.ceil((count + 1) / 5000) * 5000;
  const reached = [...CLASS_MILESTONES].reverse().find((m) => m <= count) ?? 0;
  return { count, target, reached };
}
