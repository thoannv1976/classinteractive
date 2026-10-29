import type { FastifyInstance } from 'fastify';
import type { MemberDoc, SessionDoc, UserDoc } from '@classinteract/shared';
import { createSessionSchema, endSessionSchema, joinByCodeSchema, updateSessionSchema } from '@classinteract/shared';
import { Timestamp, db, inc, now } from '../firebase';
import { assertClassWritable, loadClassAccess, requireClassManager } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { assertSessionAccepts, bumpClassStats, prepareParticipation } from '../lib/counters';
import { AppError, conflict, notFound, parse } from '../lib/errors';
import { joinCode } from '../lib/ids';
import { C } from '../lib/paths';
import { serialize, toMillis } from '../lib/time';
import { notify } from './notifications';

const JOIN_CODE_TTL_MS = 12 * 60 * 60 * 1000;

export async function getSessionOr404(classId: string, sessionId: string) {
  const snap = await C.session(classId, sessionId).get();
  if (!snap.exists) throw notFound('Không tìm thấy buổi học');
  return snap.data() as SessionDoc;
}

/** Records attendance of the current user (idempotent). */
async function joinSession(user: UserDoc, classId: string, sessionId: string) {
  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(C.session(classId, sessionId));
    if (!sSnap.exists) throw notFound('Không tìm thấy buổi học');
    assertSessionAccepts(sSnap.data() as SessionDoc, 'join');
    const p = await prepareParticipation(tx, { classId, sessionId, user });
    p.write({});
  });
}

async function allocateJoinCode(tx: FirebaseFirestore.Transaction) {
  for (let i = 0; i < 5; i++) {
    const code = joinCode();
    const ref = C.joinCodes().doc(code);
    const snap = await tx.get(ref);
    if (!snap.exists || (toMillis(snap.data()!.expiresAt) ?? 0) < Date.now()) return { code, ref };
  }
  throw new AppError(500, 'CODE_ALLOCATION', 'Không tạo được mã tham gia, thử lại');
}

export default async function sessionRoutes(app: FastifyInstance) {
  app.get('/classes/:classId/sessions', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await loadClassAccess(currentUser(req), classId);
    const snap = await C.sessions(classId).orderBy('sessionNumber', 'asc').get();
    let sessions = snap.docs.map((d) => d.data() as SessionDoc);
    if (!a.canModerate) sessions = sessions.filter((s) => s.status !== 'archived');
    const stats = sessions.length ? await db.getAll(...sessions.map((s) => C.sessionStats(classId, s.sessionId))) : [];
    return {
      items: serialize(sessions.map((s, i) => ({ ...s, joinCode: a.canModerate || s.status === 'open' ? s.joinCode : null, stats: stats[i]?.data() ?? null }))),
    };
  });

  app.post('/classes/:classId/sessions', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    const input = parse(createSessionSchema, req.body);
    const ref = C.sessions(classId).doc();
    await db.runTransaction(async (tx) => {
      const cls = await tx.get(C.class(classId));
      const number = input.sessionNumber ?? ((cls.data()?.sessionCount as number) ?? 0) + 1;
      tx.create(ref, {
        sessionId: ref.id,
        classId,
        tenantId: a.cls.tenantId,
        sessionNumber: number,
        title: input.title,
        description: input.description,
        topics: input.topics,
        date: input.date,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        status: 'draft',
        joinCode: null,
        joinCodeExpiresAt: null,
        startedAt: null,
        endedAt: null,
        lateRepliesUntil: null,
        createdBy: me.uid,
        createdAt: now(),
        updatedAt: now(),
      });
      tx.update(C.class(classId), { sessionCount: inc(1), updatedAt: now() });
    });
    await audit(req, 'session.create', 'session', ref.id, { classId, title: input.title });
    return { sessionId: ref.id };
  });

  app.get('/classes/:classId/sessions/:sessionId', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    const me = currentUser(req);
    const a = await loadClassAccess(me, classId);
    const s = await getSessionOr404(classId, sessionId);
    const [stats, att] = await Promise.all([
      C.sessionStats(classId, sessionId).get(),
      C.attendance(classId, sessionId).doc(me.uid).get(),
    ]);
    return serialize({
      session: s,
      class: a.cls,
      stats: stats.data() ?? null,
      joined: att.exists,
      access: { canManage: a.canManage, canModerate: a.canModerate, memberRole: a.ctx.memberRole },
    });
  });

  app.patch('/classes/:classId/sessions/:sessionId', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    await getSessionOr404(classId, sessionId);
    const input = parse(updateSessionSchema, req.body);
    await C.session(classId, sessionId).update({ ...input, updatedAt: now() });
    await audit(req, 'session.update', 'session', sessionId, { classId });
    return { ok: true };
  });

  app.delete('/classes/:classId/sessions/:sessionId', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    const s = await getSessionOr404(classId, sessionId);
    if (s.status !== 'draft' || s.startedAt) throw conflict('Chỉ xóa được buổi học chưa bắt đầu. Hãy lưu trữ buổi học thay vì xóa.');
    await db.runTransaction(async (tx) => {
      tx.delete(C.session(classId, sessionId));
      tx.update(C.class(classId), { sessionCount: inc(-1) });
    });
    await audit(req, 'session.delete', 'session', sessionId, { classId });
    return { ok: true };
  });

  /** Start (or re-open) a session: status open, join code, notify students. */
  app.post('/classes/:classId/sessions/:sessionId/start', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    if (a.cls.status !== 'active') throw conflict('Lớp học đang bị khóa');
    const firstStart = await db.runTransaction(async (tx) => {
      const ref = C.session(classId, sessionId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound('Không tìm thấy buổi học');
      const s = snap.data() as SessionDoc;
      if (s.status === 'archived') throw conflict('Buổi học đã lưu trữ');
      const codeValid = s.joinCode && (toMillis(s.joinCodeExpiresAt) ?? 0) > Date.now();
      const update: Record<string, unknown> = { status: 'open', endedAt: null, lateRepliesUntil: null, updatedAt: now() };
      if (!codeValid) {
        const { code, ref: codeRef } = await allocateJoinCode(tx);
        const expiresAt = Timestamp.fromMillis(Date.now() + JOIN_CODE_TTL_MS);
        tx.set(codeRef, { code, classId, sessionId, expiresAt, createdAt: now() });
        update.joinCode = code;
        update.joinCodeExpiresAt = expiresAt;
      }
      const first = !s.startedAt;
      if (first) {
        update.startedAt = now();
        bumpClassStats(tx, classId, { sessionsHeld: 1 });
      }
      tx.update(ref, update);
      return first;
    });
    await audit(req, 'session.start', 'session', sessionId, { classId });
    if (firstStart) {
      const members = await C.members(classId).where('status', '==', 'active').get();
      const s = await getSessionOr404(classId, sessionId);
      await notify(
        members.docs.map((d) => (d.data() as MemberDoc).uid),
        {
          type: 'session_opened',
          title: `Buổi học đã bắt đầu: ${a.cls.classCode}`,
          body: `Buổi ${s.sessionNumber}: ${s.title}`,
          link: `/classes/${classId}/sessions/${sessionId}`,
        },
      );
    }
    return { ok: true };
  });

  app.post('/classes/:classId/sessions/:sessionId/pause', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    const s = await getSessionOr404(classId, sessionId);
    if (s.status !== 'open') throw conflict('Chỉ tạm dừng được buổi học đang diễn ra');
    await C.session(classId, sessionId).update({ status: 'paused', updatedAt: now() });
    await audit(req, 'session.pause', 'session', sessionId, { classId });
    return { ok: true };
  });

  app.post('/classes/:classId/sessions/:sessionId/end', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    const { lateReplyMinutes } = parse(endSessionSchema, req.body);
    const s = await getSessionOr404(classId, sessionId);
    if (s.status !== 'open' && s.status !== 'paused') throw conflict('Buổi học không ở trạng thái đang diễn ra');
    await C.session(classId, sessionId).update({
      status: 'closed',
      endedAt: now(),
      lateRepliesUntil: lateReplyMinutes ? Timestamp.fromMillis(Date.now() + lateReplyMinutes * 60000) : null,
      updatedAt: now(),
    });
    // Close activities that are still open.
    const open = await C.activities(classId, sessionId).where('status', '==', 'open').get();
    if (!open.empty) {
      const batch = db.batch();
      open.docs.forEach((d) => batch.update(d.ref, { status: 'closed', closedAt: now(), updatedAt: now() }));
      await batch.commit();
    }
    await audit(req, 'session.end', 'session', sessionId, { classId, lateReplyMinutes });
    return { ok: true };
  });

  app.post('/classes/:classId/sessions/:sessionId/archive', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    const s = await getSessionOr404(classId, sessionId);
    if (s.status === 'open' || s.status === 'paused') throw conflict('Hãy kết thúc buổi học trước khi lưu trữ');
    await C.session(classId, sessionId).update({ status: 'archived', updatedAt: now() });
    await audit(req, 'session.archive', 'session', sessionId, { classId });
    return { ok: true };
  });

  app.post('/classes/:classId/sessions/:sessionId/join-code/rotate', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassManager(currentUser(req), classId);
    const code = await db.runTransaction(async (tx) => {
      const ref = C.session(classId, sessionId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const s = snap.data() as SessionDoc;
      const { code, ref: codeRef } = await allocateJoinCode(tx);
      if (s.joinCode) tx.delete(C.joinCodes().doc(s.joinCode));
      const expiresAt = Timestamp.fromMillis(Date.now() + JOIN_CODE_TTL_MS);
      tx.set(codeRef, { code, classId, sessionId, expiresAt, createdAt: now() });
      tx.update(ref, { joinCode: code, joinCodeExpiresAt: expiresAt, updatedAt: now() });
      return code;
    });
    await audit(req, 'session.rotate_code', 'session', sessionId, { classId });
    return { joinCode: code };
  });

  app.post('/classes/:classId/sessions/:sessionId/join', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    const me = currentUser(req);
    const a = await loadClassAccess(me, classId);
    assertClassWritable(a);
    await joinSession(me, classId, sessionId);
    return { ok: true, classId, sessionId };
  });

  /** QR / code entry. The code only locates the session – class membership is still required. */
  app.post('/sessions/join-by-code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const me = currentUser(req);
    const { code } = parse(joinByCodeSchema, req.body);
    const snap = await C.joinCodes().doc(code).get();
    if (!snap.exists) throw notFound('Mã tham gia không đúng');
    const { classId, sessionId, expiresAt } = snap.data() as { classId: string; sessionId: string; expiresAt: Timestamp };
    if (expiresAt.toMillis() < Date.now()) throw new AppError(410, 'CODE_EXPIRED', 'Mã tham gia đã hết hạn');
    const cls = await C.class(classId).get();
    if (!cls.exists) throw notFound();
    try {
      const a = await loadClassAccess(me, classId);
      assertClassWritable(a);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 403) {
        throw new AppError(403, 'NOT_MEMBER', 'Bạn chưa có trong danh sách lớp này', {
          classId,
          classCode: cls.data()!.classCode,
          className: cls.data()!.name,
        });
      }
      throw e;
    }
    await joinSession(me, classId, sessionId);
    return { classId, sessionId };
  });
}

