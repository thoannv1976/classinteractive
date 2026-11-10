/**
 * UniGame Hub (LTI 1.3) adapter.
 *
 * POST /lti/launch                      public: one-time Hub ticket → Firebase custom token + where to go
 * GET  /lti/contexts/:key               lecturer: the LMS course waiting to be linked + classes to choose from
 * POST /lti/contexts/:key/link          lecturer: link the LMS course to a ClassInteract class
 * POST /classes/:classId/scores/snapshots/:snapshotId/push-lms   resend a confirmed snapshot to the LMS
 *
 * Accounts: students are matched by student ID = LMS username (then by roster e-mail); staff by e-mail.
 * Only scores the lecturer confirmed (score snapshots) are ever sent to the LMS (see pushSnapshotToLms).
 */
import type { FastifyInstance } from 'fastify';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { ClassDoc, SessionDoc, StudentDirectoryDoc, UserDoc } from '@classinteract/shared';
import { SCHEMA_VERSION, STUDENT_ID_REGEX, isAdminRole, isStaffRole, normalizeEmail, normalizeStudentId } from '@classinteract/shared';
import { config } from '../config';
import { auth, db, now } from '../firebase';
import { requireClassManager } from '../lib/access';
import { createStaffAccount, searchKey } from '../lib/accounts';
import { audit } from '../lib/audit';
import { authenticate, currentUser } from '../lib/auth';
import { AppError, badRequest, forbidden, notFound, parse } from '../lib/errors';
import { directoryKey, loginKey, stableId, tempPassword } from '../lib/ids';
import { submitBulkResult, verifyLaunchTicket, type BulkResponse, type LaunchContext } from '../lib/hubSdk';
import { pickLaunchSession } from '../lib/launchSession';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';
import { importRoster } from './classes';

const ltiContexts = () => db.collection('ltiContexts');
const ltiUsers = () => db.collection('ltiUsers');
const ltiTickets = () => db.collection('ltiTickets');

/** One LMS course (per issuer) ↔ one ClassInteract class. */
export interface LtiContextDoc {
  key: string;
  tenantId: string;
  hubTenantId: string;
  issuer: string;
  contextId: string;
  title: string;
  label: string;
  classId: string | null;
  /** resource link id → Hub link target (one per LMS activity, used to send grades). */
  linkTargets: Record<string, string>;
  /** Staff who opened this course from the LMS (allowed to link it). */
  instructorUids: string[];
  linkedBy: string | null;
  linkedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LmsSyncResult {
  contextKey: string;
  contextTitle: string;
  ok: boolean;
  matched: number;
  queued: number;
  duplicate: number;
  unmatched: string[];
  error?: string;
}

const contextKey = (issuer: string, contextId: string) => stableId(config.tenantId, issuer, contextId);

/** Burns the ticket id (single use). */
async function markTicketUsed(jti: string, expiresAt: Date) {
  try {
    await ltiTickets().doc(jti).create({ expiresAt, createdAt: now() });
    return true;
  } catch {
    return false;
  }
}

/** Finds or creates the ClassInteract account for an LMS user. */
async function resolveUser(ctx: LaunchContext): Promise<{ uid: string; created: boolean; via: string }> {
  const mapRef = ltiUsers().doc(ctx.hubUserId);
  const mapped = await mapRef.get();
  if (mapped.exists) {
    const uid = mapped.data()!.uid as string;
    if ((await C.user(uid).get()).exists) return { uid, created: false, via: 'mapping' };
  }
  const result = ctx.role === 'instructor' ? await resolveStaff(ctx) : await resolveStudent(ctx);
  await mapRef.set({
    uid: result.uid,
    tenantId: config.tenantId,
    hubTenantId: ctx.tenantId,
    issuer: ctx.platform.issuer,
    ltiSub: ctx.ltiSub,
    username: ctx.username ?? null,
    email: ctx.email ?? null,
    via: result.via,
    linkedAt: now(),
  });
  return result;
}

async function resolveStaff(ctx: LaunchContext) {
  if (!ctx.email) throw new AppError(400, 'LTI_NO_EMAIL', 'LMS không gửi email của giảng viên. Hãy bật chia sẻ email trong cấu hình công cụ LTI.');
  const email = normalizeEmail(ctx.email);
  const login = await C.userLogins().doc(loginKey(config.tenantId, 'email', email)).get();
  if (login.exists) {
    const uid = login.data()!.uid as string;
    const u = (await C.user(uid).get()).data() as UserDoc | undefined;
    if (!u || !isStaffRole(u.role)) throw new AppError(403, 'LTI_ROLE_MISMATCH', 'Email này đang thuộc một tài khoản sinh viên trong ClassInteract.');
    return { uid, created: false, via: 'email' };
  }
  const uid = await createStaffAccount({
    email,
    displayName: ctx.name || email,
    role: 'lecturer',
    // Not used: the account signs in through the LMS (an admin can reset it later). No forced change:
    // the lecturer never saw this password.
    password: `${tempPassword()}${tempPassword()}A1!`,
    mustChangePassword: false,
  });
  return { uid, created: true, via: 'new_staff' };
}

async function resolveStudent(ctx: LaunchContext) {
  const fullName = ctx.name || ctx.username || 'Sinh viên';
  const sid = ctx.username && STUDENT_ID_REGEX.test(ctx.username.trim()) ? normalizeStudentId(ctx.username) : null;
  // 1) registered student with this student ID
  if (sid) {
    const login = await C.userLogins().doc(loginKey(config.tenantId, 'sid', sid)).get();
    if (login.exists) return { uid: login.data()!.uid as string, created: false, via: 'student_id' };
  }
  // 2) imported but not registered yet: by student ID, else by unique roster e-mail
  let dirRef = sid ? C.studentDirectory().doc(directoryKey(config.tenantId, sid)) : null;
  let dir = dirRef ? ((await dirRef.get()).data() as StudentDirectoryDoc | undefined) : undefined;
  if (!dir && ctx.email) {
    const byEmail = await C.studentDirectory().where('tenantId', '==', config.tenantId).where('email', '==', normalizeEmail(ctx.email)).limit(2).get();
    if (byEmail.size === 1) {
      dirRef = byEmail.docs[0]!.ref;
      dir = byEmail.docs[0]!.data() as StudentDirectoryDoc;
      if (dir.uid) return { uid: dir.uid, created: false, via: 'roster_email' };
    }
  }
  const studentId = dir?.studentId ?? sid;
  if (!studentId || !dirRef) {
    throw new AppError(400, 'LTI_NO_STUDENT_ID', 'Không xác định được mã sinh viên (username Moodle). Hãy báo giảng viên.');
  }
  // 3) create the account (no password: it signs in through the LMS)
  const uid = C.users().doc().id;
  const loginRef = C.userLogins().doc(loginKey(config.tenantId, 'sid', studentId));
  const name = dir?.fullName || fullName;
  await auth.createUser({ uid, displayName: name });
  try {
    await db.runTransaction(async (tx) => {
      const [d, l] = await Promise.all([tx.get(dirRef!), tx.get(loginRef)]);
      if (l.exists || (d.exists && (d.data() as StudentDirectoryDoc).uid)) throw new AppError(409, 'LTI_RACE', 'Tài khoản vừa được tạo, hãy mở lại hoạt động.');
      tx.create(loginRef, { uid, kind: 'sid', value: studentId, tenantId: config.tenantId });
      tx.create(C.user(uid), {
        uid,
        tenantId: config.tenantId,
        role: 'student',
        status: 'active',
        displayName: name,
        searchName: searchKey(name),
        studentId,
        email: ctx.email ? normalizeEmail(ctx.email) : (dir?.email ?? null),
        mustChangePassword: false,
        language: ctx.locale?.toLowerCase().startsWith('en') ? 'en' : 'vi',
        lastLoginAt: now(),
        schemaVersion: SCHEMA_VERSION,
        createdAt: now(),
        updatedAt: now(),
      });
      if (d.exists) tx.update(dirRef!, { uid, updatedAt: now() });
      else
        tx.create(dirRef!, {
          tenantId: config.tenantId,
          studentId,
          fullName: name,
          email: ctx.email ? normalizeEmail(ctx.email) : null,
          classIds: [],
          uid,
          importedBy: 'lti',
          createdAt: now(),
          updatedAt: now(),
        });
    });
  } catch (e) {
    await auth.deleteUser(uid).catch(() => undefined);
    throw e;
  }
  return { uid, created: true, via: dir ? 'roster' : 'new_student' };
}

/** Sends a confirmed score snapshot to every LMS activity linked to the class. */
export async function pushSnapshotToLms(classId: string, snapshotId: string): Promise<LmsSyncResult[]> {
  if (!config.lti.enabled) return [];
  const snapRef = C.class(classId).collection('scoreSnapshots').doc(snapshotId);
  const snap = await snapRef.get();
  if (!snap.exists) throw notFound();
  const s = snap.data() as { rows: Array<{ uid: string; studentId: string | null; score: number | null }>; confirmedAt: Timestamp };
  const contexts = (await ltiContexts().where('classId', '==', classId).get()).docs.map((d) => d.data() as LtiContextDoc);
  const rowsWithScore = s.rows.filter((r) => typeof r.score === 'number');
  const results: LmsSyncResult[] = [];
  if (!contexts.length || !rowsWithScore.length) return results;

  // Hub user ids of students who opened the activity from the LMS (most reliable match).
  const hubIdsByUid = new Map<string, Array<{ hubUserId: string; issuer: string }>>();
  for (let i = 0; i < rowsWithScore.length; i += 30) {
    const uids = rowsWithScore.slice(i, i + 30).map((r) => r.uid);
    const q = await ltiUsers().where('uid', 'in', uids).get();
    for (const d of q.docs) {
      const m = d.data() as { uid: string; issuer: string };
      hubIdsByUid.set(m.uid, [...(hubIdsByUid.get(m.uid) ?? []), { hubUserId: d.id, issuer: m.issuer }]);
    }
  }
  const users = await db.getAll(...rowsWithScore.map((r) => C.user(r.uid)));
  const emailByUid = new Map(users.map((u) => [u.id, (u.data() as UserDoc | undefined)?.email ?? undefined]));

  for (const c of contexts) {
    for (const linkTarget of Object.values(c.linkTargets ?? {})) {
      const rows = rowsWithScore.map((r) => ({
        hubUserId: hubIdsByUid.get(r.uid)?.find((h) => h.issuer === c.issuer)?.hubUserId,
        username: r.studentId ? r.studentId.toLowerCase() : undefined,
        email: emailByUid.get(r.uid) ?? undefined,
        score: Math.max(0, Math.min(100, Number(r.score))),
      }));
      const base = { contextKey: c.key, contextTitle: c.title, matched: 0, queued: 0, duplicate: 0, unmatched: [] as string[] };
      try {
        const res: BulkResponse = await submitBulkResult(
          { hubUrl: config.lti.hubUrl, gameId: config.lti.gameId, secret: config.lti.secret },
          { linkTarget, batchId: snapshotId, maxScore: 100, occurredAt: s.confirmedAt.toDate().toISOString(), rows },
        );
        results.push({
          ...base,
          ok: true,
          matched: res.matched,
          queued: res.queued,
          duplicate: res.duplicate,
          unmatched: res.unmatched.map((u) => (u.username ?? u.email ?? u.hub_user_id ?? '?').toUpperCase()),
        });
      } catch (e) {
        results.push({ ...base, ok: false, error: (e as Error).message.slice(0, 300) });
      }
    }
  }
  await snapRef.update({ lmsSync: results, lmsSyncedAt: now() });
  return results;
}

const linkSchema = z.object({ classId: z.string().min(1).max(64) });

/**
 * The session a student arriving from the LMS should land in: the most recently started open
 * session (a paused one if nothing is open). Lecturers often leave earlier sessions open for late
 * replies, so "any open session" would drop students into last week's class.
 */
export async function liveSessionForLaunch(classId: string): Promise<string | null> {
  const snap = await C.sessions(classId).where('status', 'in', ['open', 'paused']).get();
  const pick = pickLaunchSession(snap.docs.map((d) => d.data() as SessionDoc));
  return pick?.sessionId ?? null;
}

export default async function ltiRoutes(app: FastifyInstance) {
  /** Public: exchange a Hub launch ticket for a session. */
  app.post('/lti/launch', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    if (!config.lti.enabled) throw new AppError(404, 'LTI_DISABLED', 'Đăng nhập qua LMS chưa được bật.');
    const ticket = (req.body as { ticket?: unknown } | undefined)?.ticket;
    if (typeof ticket !== 'string' || ticket.length > 8000) throw badRequest('Thiếu vé đăng nhập');
    let ctx: LaunchContext;
    try {
      ctx = await verifyLaunchTicket(ticket, { hubUrl: config.lti.hubUrl, gameId: config.lti.gameId, markUsed: markTicketUsed });
    } catch {
      throw new AppError(401, 'LTI_TICKET_INVALID', 'Phiên mở từ LMS đã hết hạn hoặc không hợp lệ. Hãy mở lại hoạt động trong Moodle.');
    }
    if (config.lti.tenantMap[ctx.tenantId] !== config.tenantId) throw new AppError(403, 'LTI_TENANT', 'Trường trên LMS chưa được kết nối với ClassInteract.');
    if (!ctx.context?.id) throw badRequest('LMS không gửi thông tin khóa học');

    const { uid, created, via } = await resolveUser(ctx);
    const user = (await C.user(uid).get()).data() as UserDoc;
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    const actor = { uid, displayName: user.displayName, role: user.role };
    if (created || via !== 'mapping') await audit(req, 'lti.account_link', 'user', uid, { via, created, hubTenant: ctx.tenantId, username: ctx.username ?? null }, actor);

    // LMS course record (also remembers the activity's link target for grades).
    const key = contextKey(ctx.platform.issuer, ctx.context.id);
    const ref = ltiContexts().doc(key);
    const isStaffLaunch = ctx.role === 'instructor' && isStaffRole(user.role);
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as LtiContextDoc | undefined;
      const linkTargets = { ...(cur?.linkTargets ?? {}), ...(ctx.linkTarget ? { [ctx.resourceLink.id]: ctx.linkTarget } : {}) };
      const instructorUids = isStaffLaunch && !cur?.instructorUids?.includes(uid) ? [...(cur?.instructorUids ?? []), uid] : (cur?.instructorUids ?? []);
      tx.set(ref, {
        key,
        tenantId: config.tenantId,
        hubTenantId: ctx.tenantId,
        issuer: ctx.platform.issuer,
        contextId: ctx.context!.id,
        title: ctx.context!.title ?? cur?.title ?? '',
        label: ctx.context!.label ?? cur?.label ?? '',
        classId: cur?.classId ?? null,
        linkTargets,
        instructorUids,
        linkedBy: cur?.linkedBy ?? null,
        linkedAt: cur?.linkedAt ?? null,
        createdAt: cur?.createdAt ?? now(),
        updatedAt: now(),
      });
    });
    const context = (await ref.get()).data() as LtiContextDoc;

    let redirect: string;
    if (!context.classId) {
      if (!isStaffLaunch) throw new AppError(409, 'LTI_CLASS_NOT_LINKED', 'Giảng viên chưa gắn lớp ClassInteract cho khóa học này. Vui lòng quay lại sau.');
      redirect = `/lti/link/${key}`;
    } else {
      const classRef = C.class(context.classId);
      const cls = (await classRef.get()).data() as ClassDoc | undefined;
      if (!cls) throw new AppError(409, 'LTI_CLASS_MISSING', 'Lớp ClassInteract đã gắn không còn tồn tại. Hãy báo giảng viên.');
      if (isStaffLaunch) {
        if (!isAdminRole(user.role) && !cls.lecturerIds.includes(uid)) {
          await classRef.update({ lecturerIds: FieldValue.arrayUnion(uid), lecturerNames: FieldValue.arrayUnion(user.displayName), updatedAt: now() });
          await audit(req, 'lti.lecturer_added', 'class', cls.classId, { uid }, actor);
        }
        redirect = `/teach/classes/${cls.classId}`;
      } else {
        if (user.role !== 'student' || !user.studentId) throw new AppError(403, 'LTI_ROLE_MISMATCH', 'Tài khoản này không phải tài khoản sinh viên trong ClassInteract.');
        const member = await C.members(cls.classId).doc(uid).get();
        if (!member.exists || member.data()!.status !== 'active') {
          await importRoster(cls.classId, [{ studentId: user.studentId, fullName: user.displayName, email: user.email ?? undefined }], 'lti');
          await audit(req, 'lti.enrol', 'class', cls.classId, { uid, studentId: user.studentId }, actor);
        }
        const live = await liveSessionForLaunch(cls.classId);
        redirect = live ? `/classes/${cls.classId}/sessions/${live}` : `/classes/${cls.classId}`;
      }
    }
    await C.user(uid).update({ lastLoginAt: now() });
    const token = await auth.createCustomToken(uid);
    return { token, redirect };
  });

  await app.register(async (priv) => {
    priv.addHook('preHandler', authenticate);

    async function loadContextForStaff(key: string, me: UserDoc) {
      if (!isStaffRole(me.role)) throw forbidden();
      const snap = await ltiContexts().doc(key).get();
      if (!snap.exists) throw notFound();
      const c = snap.data() as LtiContextDoc;
      if (c.tenantId !== config.tenantId) throw notFound();
      if (!isAdminRole(me.role) && !c.instructorUids.includes(me.uid)) throw forbidden('Hãy mở hoạt động này từ khóa học trên LMS trước.');
      return c;
    }

    priv.get('/lti/contexts/:key', async (req) => {
      const me = currentUser(req);
      const c = await loadContextForStaff((req.params as { key: string }).key, me);
      const q = isAdminRole(me.role)
        ? C.classes().where('tenantId', '==', config.tenantId).limit(200)
        : C.classes().where('lecturerIds', 'array-contains', me.uid).limit(200);
      const classes = (await q.get()).docs
        .map((d) => d.data() as ClassDoc)
        .filter((x) => x.status !== 'archived')
        .map((x) => ({ classId: x.classId, classCode: x.classCode, name: x.name, semester: x.semester, academicYear: x.academicYear, studentCount: x.studentCount }));
      return serialize({ context: { key: c.key, title: c.title, label: c.label, classId: c.classId }, classes });
    });

    priv.post('/lti/contexts/:key/link', async (req) => {
      const me = currentUser(req);
      const key = (req.params as { key: string }).key;
      const c = await loadContextForStaff(key, me);
      const { classId } = parse(linkSchema, req.body);
      await requireClassManager(me, classId);
      await ltiContexts().doc(key).update({ classId, linkedBy: me.uid, linkedAt: now(), updatedAt: now() });
      await audit(req, 'lti.class_link', 'class', classId, { contextKey: key, lmsCourse: c.title, previous: c.classId });
      return { classId, redirect: `/teach/classes/${classId}` };
    });

    /** LMS courses linked to a class (shown on the scores page). */
    priv.get('/classes/:classId/lms-links', async (req) => {
      const { classId } = req.params as { classId: string };
      await requireClassManager(currentUser(req), classId);
      const items = (await ltiContexts().where('classId', '==', classId).get()).docs.map((d) => {
        const c = d.data() as LtiContextDoc;
        return { key: c.key, title: c.title, label: c.label, activities: Object.keys(c.linkTargets ?? {}).length };
      });
      return { enabled: config.lti.enabled, items };
    });

    priv.post('/classes/:classId/scores/snapshots/:snapshotId/push-lms', async (req) => {
      const { classId, snapshotId } = req.params as { classId: string; snapshotId: string };
      await requireClassManager(currentUser(req), classId);
      if (!config.lti.enabled) throw new AppError(404, 'LTI_DISABLED', 'Đăng nhập qua LMS chưa được bật.');
      const lmsSync = await pushSnapshotToLms(classId, snapshotId);
      await audit(req, 'score.push_lms', 'class', classId, { snapshotId, targets: lmsSync.length });
      return { lmsSync };
    });
  });
}
