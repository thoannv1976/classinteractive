import type { Transaction } from 'firebase-admin/firestore';
import type { SessionDoc, UserDoc } from '@classinteract/shared';
import { inc, now } from '../firebase';
import { AppError } from './errors';
import { C } from './paths';
import { toMillis } from './time';

type Numeric = Record<string, number>;

const incs = (delta: Numeric) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(delta)) if (v) out[k] = inc(v);
  return out;
};

export function bumpSessionStats(tx: Transaction, classId: string, sessionId: string, delta: Numeric) {
  if (!Object.values(delta).some(Boolean)) return;
  tx.set(C.sessionStats(classId, sessionId), { ...incs(delta), updatedAt: now() }, { merge: true });
}

export function bumpClassStats(tx: Transaction, classId: string, delta: Numeric) {
  if (!Object.values(delta).some(Boolean)) return;
  tx.set(C.classStats(classId), { ...incs(delta), updatedAt: now() }, { merge: true });
}

export function bumpStudentMetrics(
  tx: Transaction,
  classId: string,
  student: { uid: string; studentId: string | null; displayName: string },
  delta: Numeric,
  extra: Record<string, unknown> = {},
) {
  tx.set(
    C.studentMetrics(classId).doc(student.uid),
    {
      uid: student.uid,
      classId,
      studentId: student.studentId,
      displayName: student.displayName,
      ...incs(delta),
      ...extra,
      lastActiveAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  );
}

/** Counters for one student in one session; keys are the same as in StudentSessionMetricsDoc. */
export type StudentDelta = Partial<
  Record<'questions' | 'answers' | 'comments' | 'reflections' | 'reactions' | 'activitiesCompleted', number>
>;

const interactionTotal = (d: Record<string, unknown> | undefined) =>
  d
    ? ['questions', 'answers', 'comments', 'reflections', 'reactions', 'activitiesCompleted'].reduce(
        (s, k) => s + (Number(d[k]) || 0),
        0,
      )
    : 0;

/**
 * Reads everything needed to record a student's participation in a session (must be
 * called before any write in the transaction). `write` then updates attendance and all
 * aggregated counters consistently.
 */
export async function prepareParticipation(
  tx: Transaction,
  p: { classId: string; sessionId: string; user: UserDoc },
) {
  const countsAsStudent = p.user.role === 'student';
  const attRef = C.attendance(p.classId, p.sessionId).doc(p.user.uid);
  const ssmRef = C.studentSessionMetrics(p.classId).doc(`${p.sessionId}_${p.user.uid}`);
  const [att, ssm] = countsAsStudent ? await Promise.all([tx.get(attRef), tx.get(ssmRef)]) : [null, null];
  const hadInteraction = interactionTotal(ssm?.data()) > 0;
  const student = { uid: p.user.uid, studentId: p.user.studentId, displayName: p.user.displayName };

  return {
    countsAsStudent,
    alreadyJoined: !!att?.exists,
    write(
      delta: StudentDelta,
      opts: { sessionDelta?: Numeric; classDelta?: Numeric; studentExtra?: Numeric } = {},
    ) {
      const sessionDelta: Numeric = { ...(opts.sessionDelta ?? {}) };
      const studentClass: Numeric = { ...(delta as Numeric), ...(opts.studentExtra ?? {}) };
      if (countsAsStudent) {
        if (!att?.exists) {
          tx.set(attRef, {
            uid: p.user.uid,
            studentId: p.user.studentId,
            displayName: p.user.displayName,
            joinedAt: now(),
            lastSeenAt: now(),
          });
          sessionDelta.attendeeCount = (sessionDelta.attendeeCount ?? 0) + 1;
          studentClass.sessionsJoined = (studentClass.sessionsJoined ?? 0) + 1;
        } else {
          tx.update(attRef, { lastSeenAt: now() });
        }
        const adds = Object.values(delta).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
        if (adds > 0 && !hadInteraction) {
          sessionDelta.interactedCount = (sessionDelta.interactedCount ?? 0) + 1;
          studentClass.sessionsInteracted = (studentClass.sessionsInteracted ?? 0) + 1;
        }
        tx.set(
          ssmRef,
          { uid: p.user.uid, classId: p.classId, sessionId: p.sessionId, joined: true, ...incs(delta as Numeric), updatedAt: now() },
          { merge: true },
        );
        bumpStudentMetrics(tx, p.classId, student, studentClass);
      }
      bumpSessionStats(tx, p.classId, p.sessionId, sessionDelta);
      if (opts.classDelta) bumpClassStats(tx, p.classId, opts.classDelta);
    },
  };
}

/** Throws if the session does not accept this kind of interaction right now. */
export function assertSessionAccepts(s: SessionDoc, kind: 'join' | 'post' | 'reply' | 'submit') {
  if (s.status === 'open') return;
  if (s.status === 'paused') {
    if (kind === 'join') return;
    throw new AppError(409, 'SESSION_PAUSED', 'Buổi học đang tạm dừng, chưa nhận tương tác mới');
  }
  if (s.status === 'closed') {
    const until = toMillis(s.lateRepliesUntil);
    if (until && until > Date.now() && (kind === 'reply' || kind === 'join')) return;
    throw new AppError(409, 'SESSION_CLOSED', until && until > Date.now() ? 'Buổi học đã kết thúc, chỉ nhận trả lời bổ sung' : 'Buổi học đã kết thúc');
  }
  throw new AppError(409, 'SESSION_NOT_OPEN', 'Buổi học chưa bắt đầu');
}
