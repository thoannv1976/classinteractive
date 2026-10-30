import type { FastifyInstance } from 'fastify';
import type { ScoreConfig } from '@classinteract/shared';
import { scoreAdjustmentSchema, scoreConfigSchema } from '@classinteract/shared';
import { db, now } from '../firebase';
import { loadClassAccess, requireClassManager, requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { forbidden, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { computeClassScores, loadScoreConfig, scoreConfigRef } from '../lib/scores';
import { serialize } from '../lib/time';

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
    const live = await computeClassScores(a.cls);
    const row = live.rows.find((r) => r.uid === me.uid);
    if (!row) throw notFound();
    const { adjustmentNote: _n, ...rest } = row;
    return serialize({ config: live.config, row: rest, sessionsHeld: live.sessionsHeld });
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
    const { delta, note } = parse(scoreAdjustmentSchema, req.body);
    const ref = C.class(classId).collection('scoreAdjustments').doc(uid);
    if (delta === 0 && !note) await ref.delete();
    else await ref.set({ delta, note, by: me.uid, updatedAt: now() });
    await audit(req, 'score.adjust', 'class', classId, { uid, delta });
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
      rows: live.rows.map((r) => ({ uid: r.uid, studentId: r.studentId, displayName: r.displayName, score: r.score, raw: r.raw, adjustment: r.adjustment })),
      confirmedBy: me.uid,
      confirmedByName: me.displayName,
      confirmedAt: now(),
    });
    await audit(req, 'score.confirm', 'class', classId, { snapshotId: ref.id, version: live.config.version });
    return { snapshotId: ref.id };
  });

  app.get('/classes/:classId/scores/snapshots', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await snapshots(classId).orderBy('confirmedAt', 'desc').limit(20).get();
    return { items: serialize(snap.docs.map((d) => d.data())) };
  });
}
