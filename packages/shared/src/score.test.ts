import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORE_CONFIG, computeScore } from './score';

const sessions = [
  { sessionId: 's1', activityCount: 2, exitTicketCount: 1 },
  { sessionId: 's2', activityCount: 0, exitTicketCount: 0 },
];
const ps = (o: Partial<{ joined: boolean; questions: number; answers: number; comments: number; reflections: number }> = {}) => ({
  joined: true, questions: 0, answers: 0, comments: 0, reflections: 0, ...o,
});

describe('engagement score', () => {
  it('follows the configured weights on real opportunities', () => {
    const r = computeScore(DEFAULT_SCORE_CONFIG, sessions, {
      perSession: { s1: ps({ questions: 5, answers: 1, comments: 1 }), s2: ps({ answers: 3 }) },
      activitiesCompleted: 2, // 1 regular + 1 exit ticket
      exitTickets: 1,
      acceptedAnswers: 1,
    });
    // activities 1/1, answers (2 + 3)/6, questions min(5,2)/4, helpful 1/4, exit 1/1
    expect(r.components.activities.value).toBe(1);
    expect(r.components.answers.value).toBeCloseTo(5 / 6);
    expect(r.components.questions.value).toBe(0.5);
    expect(r.components.helpful.value).toBe(0.25);
    expect(r.components.exitTickets.value).toBe(1);
    const expected = (30 * 1 + 25 * (5 / 6) + 20 * 0.5 + 15 * 0.25 + 10 * 1) / 100 * 100;
    expect(r.score).toBeCloseTo(Math.round(expected * 10) / 10);
  });

  it('a session without activities does not lower the score; spam is capped', () => {
    const one = computeScore(DEFAULT_SCORE_CONFIG, [sessions[0]!], { perSession: { s1: ps({ questions: 2, answers: 3 }) }, activitiesCompleted: 1, exitTickets: 0, acceptedAnswers: 0 });
    const spam = computeScore(DEFAULT_SCORE_CONFIG, [sessions[0]!], { perSession: { s1: ps({ questions: 50, answers: 90 }) }, activitiesCompleted: 1, exitTickets: 0, acceptedAnswers: 0 });
    expect(spam.score).toBe(one.score);
    const none = computeScore(DEFAULT_SCORE_CONFIG, [{ sessionId: 's2', activityCount: 0, exitTicketCount: 0 }], { perSession: { s2: ps({ questions: 2, answers: 3 }) }, activitiesCompleted: 0, exitTickets: 0, acceptedAnswers: 0 });
    expect(none.components.activities.value).toBeNull();
    expect(none.components.exitTickets.value).toBeNull();
    // only answers, questions, helpful count → 25*1 + 20*1 + 15*0 over 60
    expect(none.score).toBeCloseTo(75);
  });

  it('attended basis ignores absent sessions; adjustment is clamped', () => {
    const r = computeScore({ ...DEFAULT_SCORE_CONFIG, basis: 'attended' }, sessions, {
      perSession: { s1: ps({ joined: false }), s2: ps({ answers: 3, questions: 2 }) },
      activitiesCompleted: 0, exitTickets: 0, acceptedAnswers: 2, adjustment: 50,
    });
    expect(r.sessionsCounted).toBe(1);
    expect(r.score).toBe(100);
    expect(computeScore(DEFAULT_SCORE_CONFIG, [], { perSession: {}, activitiesCompleted: 0, exitTickets: 0, acceptedAnswers: 0 }).score).toBeNull();
  });
});
