/** Pure helpers for participation statistics (shared by API, exports and UI). */

export const safeRate = (part: number, total: number) => (total > 0 ? Math.min(1, part / total) : null);

export const formatPercent = (rate: number | null, digits = 0) =>
  rate === null ? '—' : `${(rate * 100).toFixed(digits)}%`;

export interface ParticipationCounts {
  sessionsJoined: number;
  questions: number;
  answers: number;
  comments: number;
  reflections: number;
  activitiesCompleted: number;
  quizzesAnswered: number;
  quizCorrect: number;
}

/**
 * Derived indicators. Rates are computed against real opportunities
 * (sessions actually held, activities actually opened), never against a fixed total.
 */
export function deriveParticipation(
  c: ParticipationCounts,
  opportunities: { sessionsHeld: number; activitiesOpened: number },
) {
  const interactions = c.questions + c.answers + c.comments + c.reflections + c.activitiesCompleted;
  return {
    interactions,
    attendanceRate: safeRate(c.sessionsJoined, opportunities.sessionsHeld),
    activityCompletionRate: safeRate(c.activitiesCompleted, opportunities.activitiesOpened),
    quizAccuracy: safeRate(c.quizCorrect, c.quizzesAnswered),
  };
}

/** Participation consistency: share of held sessions in which the student interacted at least once. */
export function consistency(sessionsWithInteraction: number, sessionsHeld: number) {
  return safeRate(sessionsWithInteraction, sessionsHeld);
}
