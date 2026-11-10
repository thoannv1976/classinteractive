import type { ClassDoc, ScoreConfig, SessionStatsDoc, StudentSessionMetricsDoc } from '@classinteract/shared';
import { DEFAULT_SCORE_CONFIG, computeScore } from '@classinteract/shared';
import { C } from './paths';
import { loadSessionsWithStats, loadStudents } from './classData';

export const scoreConfigRef = (classId: string) => C.class(classId).collection('scoreConfigs').doc('current');

export async function loadScoreConfig(classId: string): Promise<ScoreConfig> {
  const snap = await scoreConfigRef(classId).get();
  return (snap.data() as ScoreConfig | undefined) ?? ({ ...DEFAULT_SCORE_CONFIG, createdBy: 'system', createdAt: null } as unknown as ScoreConfig);
}

type PerSession = Record<string, { joined: boolean; questions: number; answers: number; comments: number; reflections: number }>;

/** Everything the score formula reads for one class, loaded once. */
async function loadScoreInputs(cls: ClassDoc) {
  const [config, sessions, students, ssmSnap, adjSnap] = await Promise.all([
    loadScoreConfig(cls.classId),
    loadSessionsWithStats(cls.classId),
    loadStudents(cls.classId),
    C.studentSessionMetrics(cls.classId).get(),
    C.class(cls.classId).collection('scoreAdjustments').get(),
  ]);
  const heldSessions = sessions.filter((s) => s.startedAt);
  const held = heldSessions.map((s) => ({
    sessionId: s.sessionId,
    activityCount: (s.stats as SessionStatsDoc | null)?.activityCount ?? 0,
    exitTicketCount: (s.stats as SessionStatsDoc | null)?.exitTicketCount ?? 0,
  }));
  const perStudent = new Map<string, PerSession>();
  for (const d of ssmSnap.docs) {
    const m = d.data() as StudentSessionMetricsDoc;
    const rec = perStudent.get(m.uid) ?? {};
    rec[m.sessionId] = { joined: !!m.joined, questions: m.questions ?? 0, answers: m.answers ?? 0, comments: m.comments ?? 0, reflections: m.reflections ?? 0 };
    perStudent.set(m.uid, rec);
  }
  const adjustments = new Map(adjSnap.docs.map((d) => [d.id, d.data() as { delta: number; note: string; by: string; excluded?: boolean }]));
  return { config, heldSessions, held, students, perStudent, adjustments };
}

/** Live engagement scores of all students in a class. */
export async function computeClassScores(cls: ClassDoc) {
  const { config, held, students, perStudent, adjustments } = await loadScoreInputs(cls);
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
      return {
        uid: member.uid,
        studentId: member.studentId,
        displayName: member.displayName,
        ...r,
        adjustmentNote: adj?.note ?? '',
        // Left out of confirmed scores and the LMS push (test accounts and the like).
        excluded: !!adj?.excluded,
      };
    });
  return { config, rows, sessionsHeld: held.length };
}

/**
 * One student's score with a per-session breakdown, so the lecturer and the student can see
 * exactly which sessions are missing which contributions.
 */
export async function computeStudentScoreDetail(cls: ClassDoc, uid: string) {
  const { config, heldSessions, held, students, perStudent, adjustments } = await loadScoreInputs(cls);
  const student = students.find((s) => s.member.uid === uid);
  if (!student) return null;
  const adj = adjustments.get(uid);
  const per = perStudent.get(uid) ?? {};
  const r = computeScore(config, held, {
    perSession: per,
    activitiesCompleted: student.metrics?.activitiesCompleted ?? 0,
    exitTickets: student.metrics?.exitTickets ?? 0,
    acceptedAnswers: student.metrics?.acceptedAnswers ?? 0,
    adjustment: adj?.delta ?? 0,
  });
  const sessions = heldSessions.map((s) => {
    const p = per[s.sessionId];
    return {
      sessionId: s.sessionId,
      sessionNumber: s.sessionNumber,
      title: s.title,
      startedAt: s.startedAt,
      joined: !!p?.joined,
      questions: p?.questions ?? 0,
      contributions: (p?.answers ?? 0) + (p?.comments ?? 0) + (p?.reflections ?? 0),
    };
  });
  return {
    config,
    sessionsHeld: held.length,
    row: {
      uid,
      studentId: student.member.studentId,
      displayName: student.member.displayName,
      ...r,
      adjustmentNote: adj?.note ?? '',
      excluded: !!adj?.excluded,
    },
    sessions,
  };
}
