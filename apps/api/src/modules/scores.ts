import type { FastifyInstance } from 'fastify';
import type { ScoreConfig } from '@classinteract/shared';
import type { ClassStatsDoc } from '@classinteract/shared';
import { computeBadges, computeStreak, nextMilestone, scoreAdjustmentSchema, scoreConfigSchema } from '@classinteract/shared';
import { db, now } from '../firebase';
import { loadClassAccess, requireClassManager, requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { forbidden, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { computeAtRisk, computeClassScores, computeStudentScoreDetail, loadScoreConfig, scoreConfigRef } from '../lib/scores';
import { serialize } from '../lib/time';
import { pushSnapshotToLms } from './lti';
import { notify } from './notifications';
import { z } from 'zod';

const snapshots = (classId: string) => C.class(classId).collection('scoreSnapshots');

export default async function scoreRoutes(app: FastifyInstance) {
  /** Reference engagement scores (not official until the lecturer confirms a snapshot). */
  app.get('/classes/:classId/scores', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await requireClassModerator(currentUser(req), classId);
    const [live, last] = await Promise.all([computeClassScores(a.cls), snapshots(classId).orderBy('confirmedAt', 'desc').limit(1).get()]);
    return serialize({ ...live, lastSnapshot: last.docs[0] ? { ...last.docs[0].data(), rows: undefined } : null });
  });

  /** A student's own reference score, when the class shows scores to students. */
  app.get('/classes/:classId/scores/me', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await loadClassAccess(me, classId);
    if (!a.cls.settings.showScoreToStudents && !a.canModerate) throw forbidden('Lớp chưa hiển thị điểm tham gia cho sinh viên');
    const detail = await computeStudentScoreDetail(a.cls, me.uid);
    if (!detail) throw notFound();
    // The lecturer's note and the test-account flag stay with the lecturer.
    const { adjustmentNote: _n, excluded: _x, ...row } = detail.row;
    return serialize({ ...detail, row });
  });

  /**
   * The signed-in student's badges and attendance streak, plus the class goals everyone works
   * towards together. Shown whether or not the class shows scores (no score is included).
   */
  app.get('/classes/:classId/achievements/me', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await loadClassAccess(me, classId);
    const [detail, statsSnap] = await Promise.all([computeStudentScoreDetail(a.cls, me.uid), C.classStats(classId).get()]);
    const stats = statsSnap.data() as ClassStatsDoc | undefined;
    const classGoals = {
      questions: nextMilestone(stats?.questionCount ?? 0),
      answers: nextMilestone((stats?.answerCount ?? 0) + (stats?.commentCount ?? 0) + (stats?.reflectionCount ?? 0)),
    };
    if (!detail) return { badges: [], streak: { current: 0, best: 0 }, sessionsHeld: 0, classGoals };
    const c = detail.row.components;
    return {
      badges: computeBadges({
        sessions: detail.sessions,
        caps: detail.config.caps,
        acceptedAnswers: c.helpful.done,
        activities: { done: c.activities.done, possible: c.activities.possible },
        exitTickets: { done: c.exitTickets.done, possible: c.exitTickets.possible },
      }),
      streak: computeStreak(detail.sessions),
      sessionsHeld: detail.sessionsHeld,
      classGoals,
    };
  });

  /** One student's score with a per-session breakdown (lecturer view). */
  app.get('/classes/:classId/scores/students/:uid', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    const a = await requireClassModerator(currentUser(req), classId);
    const detail = await computeStudentScoreDetail(a.cls, uid);
    if (!detail) throw notFound();
    return serialize(detail);
  });

  app.put('/classes/:classId/score-config', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassManager(me, classId);
    const input = parse(scoreConfigSchema, req.body);
    const current = await loadScoreConfig(classId);
    const next: ScoreConfig = { ...input, version: (current.version ?? 1) + 1, createdBy: me.uid, createdAt: now() as never };
    await db.runTransaction(async (tx) => {
      tx.set(scoreConfigRef(classId), next);
      tx.set(C.class(classId).collection('scoreConfigs').doc(`v${next.version}`), next);
    });
    await audit(req, 'score.config', 'class', classId, { version: next.version, weights: input.weights });
    return { version: next.version };
  });

  app.put('/classes/:classId/score-adjustments/:uid', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    const me = currentUser(req);
    await requireClassManager(me, classId);
    const { delta, note, excluded } = parse(scoreAdjustmentSchema, req.body);
    const ref = C.class(classId).collection('scoreAdjustments').doc(uid);
    if (delta === 0 && !note && !excluded) await ref.delete();
    else await ref.set({ delta, note, excluded, by: me.uid, updatedAt: now() });
    await audit(req, 'score.adjust', 'class', classId, { uid, delta, excluded });
    return { ok: true };
  });

  /** Lecturer confirms the current scores (the only scores that may be used officially). */
  app.post('/classes/:classId/scores/confirm', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    const live = await computeClassScores(a.cls);
    const ref = snapshots(classId).doc();
    await ref.set({
      snapshotId: ref.id,
      configVersion: live.config.version,
      config: live.config,
      sessionsHeld: live.sessionsHeld,
      // Excluded members (test accounts) are not part of the official scores nor the LMS push.
      rows: live.rows.filter((r) => !r.excluded).map((r) => ({ uid: r.uid, studentId: r.studentId, displayName: r.displayName, score: r.score, raw: r.raw, adjustment: r.adjustment })),
      confirmedBy: me.uid,
      confirmedByName: me.displayName,
      confirmedAt: now(),
    });
    await audit(req, 'score.confirm', 'class', classId, { snapshotId: ref.id, version: live.config.version });
    // Students who can see their score are told it was confirmed (in-app, best effort).
    if (a.cls.settings.showScoreToStudents) {
      await notify(
        live.rows.filter((r) => !r.excluded).map((r) => r.uid),
        {
          type: 'score_confirmed',
          title: 'Giảng viên đã xác nhận điểm tham gia',
          body: 'Xem điểm của bạn và cách tăng điểm trong "Mức độ tham gia của tôi".',
          bodyTranslatable: true,
          link: `/participation/${classId}`,
        },
      );
    }
    // Confirmed scores are the only ones sent to the LMS gradebook (UniGame Hub). Failures never block the confirmation.
    const lmsSync = await pushSnapshotToLms(classId, ref.id).catch((e: Error) => {
      req.log.warn({ err: e.message, classId }, 'LMS grade push failed');
      return [];
    });
    return { snapshotId: ref.id, lmsSync };
  });

  /** Students who need a nudge (never joined, no contribution, missed the last sessions). */
  app.get('/classes/:classId/at-risk', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await requireClassModerator(currentUser(req), classId);
    return serialize(await computeAtRisk(a.cls));
  });

  /** In-app reminder from the lecturer to chosen students of the class. */
  app.post('/classes/:classId/reminders', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    const input = parse(z.object({ uids: z.array(z.string().min(1).max(128)).min(1).max(500), message: z.string().trim().max(1000).default('') }), req.body);
    const members = await db.getAll(...input.uids.map((uid) => C.members(classId).doc(uid)));
    const uids = members.filter((m) => m.exists && m.data()!.status === 'active').map((m) => m.id);
    await notify(uids, {
      type: 'participation_reminder',
      title: 'Nhắc nhở tham gia lớp {{classCode}}',
      titleParams: { classCode: a.cls.classCode },
      body: input.message || 'Giảng viên nhắc bạn tham gia các buổi học trên ClassInteract: vào buổi, đặt câu hỏi, trả lời và làm hoạt động để có điểm tham gia.',
      bodyTranslatable: !input.message,
      link: `/classes/${classId}`,
    });
    await audit(req, 'reminder.send', 'class', classId, { count: uids.length });
    return { sent: uids.length };
  });

  app.get('/classes/:classId/scores/snapshots', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await snapshots(classId).orderBy('confirmedAt', 'desc').limit(20).get();
    return { items: serialize(snap.docs.map((d) => d.data())) };
  });
}
