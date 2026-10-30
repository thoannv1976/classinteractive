import type { ClassDoc, ScoreConfig, SessionStatsDoc, StudentSessionMetricsDoc } from '@classinteract/shared';
import { DEFAULT_SCORE_CONFIG, computeScore } from '@classinteract/shared';
import { C } from './paths';
import { loadSessionsWithStats, loadStudents } from './classData';

export const scoreConfigRef = (classId: string) => C.class(classId).collection('scoreConfigs').doc('current');

export async function loadScoreConfig(classId: string): Promise<ScoreConfig> {
  const snap = await scoreConfigRef(classId).get();
  return (snap.data() as ScoreConfig | undefined) ?? ({ ...DEFAULT_SCORE_CONFIG, createdBy: 'system', createdAt: null } as unknown as ScoreConfig);
}

/** Live engagement scores of all students in a class. */
export async function computeClassScores(cls: ClassDoc) {
  const [config, sessions, students, ssmSnap, adjSnap] = await Promise.all([
    loadScoreConfig(cls.classId),
    loadSessionsWithStats(cls.classId),
    loadStudents(cls.classId),
    C.studentSessionMetrics(cls.classId).get(),
    C.class(cls.classId).collection('scoreAdjustments').get(),
  ]);
  const held = sessions
    .filter((s) => s.startedAt)
    .map((s) => ({ sessionId: s.sessionId, activityCount: (s.stats as SessionStatsDoc | null)?.activityCount ?? 0, exitTicketCount: (s.stats as SessionStatsDoc | null)?.exitTicketCount ?? 0 }));
  const perStudent = new Map<string, Record<string, { joined: boolean; questions: number; answers: number; comments: number; reflections: number }>>();
  for (const d of ssmSnap.docs) {
    const m = d.data() as StudentSessionMetricsDoc;
    const rec = perStudent.get(m.uid) ?? {};
    rec[m.sessionId] = { joined: !!m.joined, questions: m.questions ?? 0, answers: m.answers ?? 0, comments: m.comments ?? 0, reflections: m.reflections ?? 0 };
    perStudent.set(m.uid, rec);
  }
  const adjustments = new Map(adjSnap.docs.map((d) => [d.id, d.data() as { delta: number; note: string; by: string }]));
  const rows = students
    .filter((s) => s.member.role === 'student' || s.member.role === 'ta')
    .map(({ member, metrics }) => {
      const adj = adjustments.get(member.uid);
      const r = computeScore(config, held, {
        perSession: perStudent.get(member.uid) ?? {},
        activitiesCompleted: metrics?.activitiesCompleted ?? 0,
        exitTickets: metrics?.exitTickets ?? 0,
        acceptedAnswers: metrics?.acceptedAnswers ?? 0,
        adjustment: adj?.delta ?? 0,
      });
      return { uid: member.uid, studentId: member.studentId, displayName: member.displayName, ...r, adjustmentNote: adj?.note ?? '' };
    });
  return { config, rows, sessionsHeld: held.length };
}
