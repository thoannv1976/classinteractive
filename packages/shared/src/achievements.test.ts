import { describe, expect, it } from 'vitest';
import { computeBadges, computeStreak, nextMilestone } from './achievements';

const caps = { answers: 3, questions: 2, helpful: 2 };
const s = (joined: boolean, questions = 0, contributions = 0) => ({ joined, questions, contributions });

describe('achievements', () => {
  it('counts the current and best attendance streak', () => {
    expect(computeStreak([s(true), s(true), s(false), s(true), s(true), s(true)])).toEqual({ current: 3, best: 3 });
    expect(computeStreak([s(true), s(true), s(true), s(false)])).toEqual({ current: 0, best: 3 });
    expect(computeStreak([])).toEqual({ current: 0, best: 0 });
  });

  it('earns per-session badges only when the session cap is reached', () => {
    const badges = computeBadges({
      sessions: [s(true, 2, 3), s(true, 2, 1), s(true, 3, 4), s(false)],
      caps,
      acceptedAnswers: 0,
      activities: { done: 2, possible: 2 },
      exitTickets: { done: 0, possible: 0 },
    });
    const by = Object.fromEntries(badges.map((b) => [b.id, b]));
    expect(by.first_step!.earned).toBe(true);
    expect(by.curious).toEqual(expect.objectContaining({ earned: true, current: 3, target: 3 }));
    expect(by.helper).toEqual(expect.objectContaining({ earned: false, current: 2, target: 3 }));
    expect(by.recognized!.earned).toBe(false);
    // only 2 activities opened so far: not enough for "never missed an activity"
    expect(by.all_activities!.earned).toBe(false);
    expect(by.reflective!.earned).toBe(false);
    // missed one of 4 sessions
    expect(by.regular).toEqual(expect.objectContaining({ earned: false, current: 3, target: 4 }));
  });

  it('awards full attendance, activities and exit tickets', () => {
    const by = Object.fromEntries(
      computeBadges({ sessions: [s(true), s(true), s(true)], caps, acceptedAnswers: 2, activities: { done: 4, possible: 4 }, exitTickets: { done: 2, possible: 2 } }).map((b) => [b.id, b]),
    );
    expect(by.regular!.earned).toBe(true);
    expect(by.all_activities!.earned).toBe(true);
    expect(by.reflective!.earned).toBe(true);
    expect(by.recognized!.earned).toBe(true);
  });

  it('sets the class goal at the next milestone', () => {
    expect(nextMilestone(0)).toEqual({ count: 0, target: 25, reached: 0 });
    expect(nextMilestone(122)).toEqual({ count: 122, target: 200, reached: 100 });
    expect(nextMilestone(200)).toEqual({ count: 200, target: 300, reached: 200 });
    expect(nextMilestone(12000).target).toBe(15000);
  });
});
