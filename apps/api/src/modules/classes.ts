import type { FastifyInstance } from 'fastify';
import type {
  ClassDoc,
  ClassSettings,
  CourseDoc,
  EnrollmentRequestDoc,
  MemberDoc,
  StudentDirectoryDoc,
  UserDoc,
} from '@classinteract/shared';
import {
  SCHEMA_VERSION,
  addMembersSchema,
  createClassSchema,
  decideEnrollmentSchema,
  enrollmentRequestSchema,
  importRosterSchema,
  isAdminRole,
  isStaffRole,
  moveMemberSchema,
  rosterRowSchema,
  updateClassSchema,
  updateMemberSchema,
  type RosterRow,
} from '@classinteract/shared';
import { z } from 'zod';
import { config } from '../config';
import { FieldValue, db, inc, now } from '../firebase';
import { requireClassManager, requireClassModerator, loadClassAccess } from '../lib/access';
import { searchKey } from '../lib/accounts';
import { audit } from '../lib/audit';
import { currentUser, requireStaff } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { directoryKey } from '../lib/ids';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';
import { notify } from './notifications';

export const DEFAULT_CLASS_SETTINGS: ClassSettings = {
  allowAnonymous: true,
  revealAnonymousToStaff: false,
  editWindowMinutes: 15,
  aiEnabled: true,
  aiMode: 'assistant',
  aiDailyQuota: 200,
  aiStudentDailyQuota: 5,
  aiProvider: null,
};

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function lecturerNames(ids: string[]) {
  if (!ids.length) return [];
  const snaps = await db.getAll(...ids.map((id) => C.user(id)));
  return snaps.map((s) => {
    const u = s.data() as UserDoc | undefined;
    if (!u || u.role === 'student') throw badRequest('Giảng viên không hợp lệ');
    return u.displayName;
  });
}

function memberDoc(classId: string, uid: string, studentId: string | null, displayName: string, by: string) {
  return {
    uid,
    classId,
    role: 'student',
    status: 'active',
    studentId,
    displayName,
    searchName: searchKey(displayName),
    assignedBy: by,
    assignedAt: now(),
    updatedAt: now(),
  };
}

/**
 * Adds students (by roster rows) to a class. Unregistered student IDs are stored in the
 * student directory so that they can register later; registered ones become members immediately.
 */
export async function importRoster(classId: string, rows: RosterRow[], actorUid: string) {
  const unique = new Map(rows.map((r) => [r.studentId, r]));
  const list = [...unique.values()];
  const result = { total: list.length, created: 0, updated: 0, enrolled: 0, pendingRegistration: 0, alreadyMember: 0 };
  for (const part of chunk(list, 200)) {
    const dirRefs = part.map((r) => C.studentDirectory().doc(directoryKey(config.tenantId, r.studentId)));
    const dirSnaps = await db.getAll(...dirRefs);
    const registered = dirSnaps
      .map((s, i) => ({ s, row: part[i]! }))
      .filter(({ s }) => s.exists && (s.data() as StudentDirectoryDoc).uid);
    const memberSnaps = registered.length
      ? await db.getAll(...registered.map(({ s }) => C.members(classId).doc((s.data() as StudentDirectoryDoc).uid!)))
      : [];
    const memberByUid = new Map(memberSnaps.map((m) => [m.id, m]));
    const userSnaps = registered.length
      ? await db.getAll(...registered.map(({ s }) => C.user((s.data() as StudentDirectoryDoc).uid!)))
      : [];
    const userByUid = new Map(userSnaps.map((u) => [u.id, u.data() as UserDoc | undefined]));

    const batch = db.batch();
    let added = 0;
    part.forEach((row, i) => {
      const snap = dirSnaps[i]!;
      const ref = dirRefs[i]!;
      if (!snap.exists) {
        batch.set(ref, {
          tenantId: config.tenantId,
          studentId: row.studentId,
          fullName: row.fullName,
          email: row.email ?? null,
          classIds: [classId],
          uid: null,
          importedBy: actorUid,
          createdAt: now(),
          updatedAt: now(),
        });
        result.created++;
        result.pendingRegistration++;
        return;
      }
      const dir = snap.data() as StudentDirectoryDoc;
      const update: Record<string, unknown> = { classIds: FieldValue.arrayUnion(classId), updatedAt: now() };
      if (!dir.uid) {
        update.fullName = row.fullName;
        if (row.email) update.email = row.email;
        result.pendingRegistration++;
      }
      batch.update(ref, update);
      result.updated++;
      if (dir.uid) {
        const m = memberByUid.get(dir.uid);
        if (m?.exists && (m.data() as MemberDoc).status === 'active') {
          result.alreadyMember++;
          return;
        }
        const u = userByUid.get(dir.uid);
        if (!u || u.role !== 'student') return;
        batch.set(C.members(classId).doc(dir.uid), memberDoc(classId, dir.uid, dir.studentId, u.displayName, actorUid));
        added++;
        result.enrolled++;
      }
    });
    if (added) batch.update(C.class(classId), { studentCount: inc(added), updatedAt: now() });
    await batch.commit();
  }
  return result;
}

async function removeMember(classId: string, uid: string) {
  await db.runTransaction(async (tx) => {
    const ref = C.members(classId).doc(uid);
    const m = await tx.get(ref);
    if (!m.exists || (m.data() as MemberDoc).status !== 'active') throw notFound('Sinh viên không có trong lớp');
    const studentId = (m.data() as MemberDoc).studentId;
    tx.update(ref, { status: 'removed', role: 'student', updatedAt: now() });
    tx.update(C.class(classId), { studentCount: inc(-1), updatedAt: now() });
    if (studentId) {
      tx.set(
        C.studentDirectory().doc(directoryKey(config.tenantId, studentId)),
        { classIds: FieldValue.arrayRemove(classId), updatedAt: now() },
        { merge: true },
      );
    }
  });
}

async function addRegisteredMember(classId: string, user: UserDoc, actorUid: string) {
  return db.runTransaction(async (tx) => {
    const ref = C.members(classId).doc(user.uid);
    const m = await tx.get(ref);
    if (m.exists && (m.data() as MemberDoc).status === 'active') return false;
    tx.set(ref, memberDoc(classId, user.uid, user.studentId, user.displayName, actorUid));
    tx.update(C.class(classId), { studentCount: inc(1), updatedAt: now() });
    if (user.studentId) {
      tx.set(
        C.studentDirectory().doc(directoryKey(config.tenantId, user.studentId)),
        { classIds: FieldValue.arrayUnion(classId), updatedAt: now() },
        { merge: true },
      );
    }
    return true;
  });
}

export default async function classRoutes(app: FastifyInstance) {
  /** Classes visible to the caller: memberships for students, assignments for lecturers, all for admins. */
  app.get('/classes', async (req) => {
    const me = currentUser(req);
    const q = parse(z.object({ status: z.string().optional(), all: z.coerce.boolean().optional() }), req.query);
    let classes: ClassDoc[] = [];
    if (isAdminRole(me.role) && q.all !== false) {
      const snap = await C.classes().where('tenantId', '==', config.tenantId).orderBy('createdAt', 'desc').limit(500).get();
      classes = snap.docs.map((d) => d.data() as ClassDoc);
    } else {
      const ids = new Set<string>();
      if (isStaffRole(me.role)) {
        const t = await C.classes().where('lecturerIds', 'array-contains', me.uid).get();
        t.docs.forEach((d) => ids.add(d.id));
      }
      const m = await db.collectionGroup('members').where('uid', '==', me.uid).where('status', '==', 'active').get();
      m.docs.forEach((d) => ids.add((d.data() as MemberDoc).classId));
      if (ids.size) {
        const snaps = await db.getAll(...[...ids].map((id) => C.class(id)));
        classes = snaps.filter((s) => s.exists).map((s) => s.data() as ClassDoc);
      }
    }
    if (q.status) classes = classes.filter((c) => c.status === q.status);
    if (!isStaffRole(me.role)) classes = classes.filter((c) => c.status !== 'archived');
    classes.sort((a, b) => (a.classCode < b.classCode ? -1 : 1));
    return { items: serialize(classes) };
  });

  app.post('/classes', { preHandler: requireStaff }, async (req) => {
    const me = currentUser(req);
    const input = parse(createClassSchema, req.body);
    const course = await C.courses().doc(input.courseId).get();
    if (!course.exists) throw badRequest('Học phần không tồn tại');
    const c = course.data() as CourseDoc;
    let lecturerIds = input.lecturerIds ?? [];
    if (!isAdminRole(me.role)) lecturerIds = [me.uid, ...lecturerIds.filter((id) => id !== me.uid)];
    const dup = await C.classes()
      .where('tenantId', '==', config.tenantId)
      .where('classCode', '==', input.classCode)
      .where('semester', '==', input.semester)
      .limit(1)
      .get();
    if (!dup.empty) throw conflict(`Lớp ${input.classCode} đã tồn tại trong ${input.semester}`);
    const ref = C.classes().doc();
    const doc = {
      classId: ref.id,
      tenantId: config.tenantId,
      courseId: c.courseId,
      courseCode: c.code,
      courseName: c.name,
      classCode: input.classCode,
      name: input.name || c.name,
      semester: input.semester,
      academicYear: input.academicYear,
      schedule: input.schedule,
      lecturerIds,
      lecturerNames: await lecturerNames(lecturerIds),
      status: 'active',
      studentCount: 0,
      sessionCount: 0,
      settings: DEFAULT_CLASS_SETTINGS,
      createdBy: me.uid,
      createdAt: now(),
      updatedAt: now(),
      schemaVersion: SCHEMA_VERSION,
    };
    await ref.set(doc);
    await audit(req, 'class.create', 'class', ref.id, { classCode: input.classCode, semester: input.semester });
    return { classId: ref.id };
  });

  app.get('/classes/:classId', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await loadClassAccess(currentUser(req), classId);
    return serialize({ class: a.cls, access: { canManage: a.canManage, canModerate: a.canModerate, memberRole: a.ctx.memberRole } });
  });

  app.patch('/classes/:classId', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    const input = parse(updateClassSchema, req.body);
    const update: Record<string, unknown> = { updatedAt: now() };
    for (const k of ['name', 'semester', 'academicYear', 'schedule', 'status'] as const) {
      if (input[k] !== undefined) update[k] = input[k];
    }
    if (input.lecturerIds) {
      if (!isAdminRole(me.role)) throw forbidden('Chỉ quản trị viên được phân công giảng viên');
      update.lecturerIds = input.lecturerIds;
      update.lecturerNames = await lecturerNames(input.lecturerIds);
    }
    if (input.settings) update.settings = { ...a.cls.settings, ...input.settings };
    await C.class(classId).update(update);
    await audit(req, 'class.update', 'class', classId, { ...input });
    return { ok: true };
  });

  // ----- Members & roster -----
  app.get('/classes/:classId/members', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const [members, pending] = await Promise.all([
      C.members(classId).where('status', '==', 'active').get(),
      C.studentDirectory().where('classIds', 'array-contains', classId).where('uid', '==', null).get(),
    ]);
    const items = members.docs.map((d) => d.data() as MemberDoc).sort((a, b) => ((a.studentId ?? '') < (b.studentId ?? '') ? -1 : 1));
    const pendingRoster = pending.docs
      .map((d) => d.data() as StudentDirectoryDoc)
      .map((d) => ({ studentId: d.studentId, fullName: d.fullName, email: d.email }))
      .sort((a, b) => (a.studentId < b.studentId ? -1 : 1));
    return serialize({ members: items, pendingRoster });
  });

  /** Import a class list (rows parsed from CSV/XLSX on the client, validated here). */
  app.post('/classes/:classId/roster/import', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassManager(me, classId);
    const { rows } = parse(importRosterSchema, req.body);
    const valid: RosterRow[] = [];
    const errors: { row: number; message: string }[] = [];
    rows.forEach((r, i) => {
      const p = rosterRowSchema.safeParse(r);
      if (p.success) valid.push(p.data);
      else errors.push({ row: i + 1, message: p.error.issues.map((x) => x.message).join('; ') });
    });
    const result = valid.length ? await importRoster(classId, valid, me.uid) : null;
    await audit(req, 'class.import_roster', 'class', classId, { valid: valid.length, errors: errors.length });
    return { result, errors };
  });

  app.delete('/classes/:classId/roster/:studentId', async (req) => {
    const { classId, studentId } = req.params as { classId: string; studentId: string };
    await requireClassManager(currentUser(req), classId);
    const ref = C.studentDirectory().doc(directoryKey(config.tenantId, studentId.toUpperCase()));
    const snap = await ref.get();
    if (!snap.exists) throw notFound();
    await ref.update({ classIds: FieldValue.arrayRemove(classId), updatedAt: now() });
    await audit(req, 'class.remove_roster_entry', 'class', classId, { studentId });
    return { ok: true };
  });

  /** Add already-imported students by student ID. */
  app.post('/classes/:classId/members', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassManager(me, classId);
    const { studentIds } = parse(addMembersSchema, req.body);
    const snaps = await db.getAll(...studentIds.map((s) => C.studentDirectory().doc(directoryKey(config.tenantId, s))));
    const missing = studentIds.filter((_, i) => !snaps[i]!.exists);
    const rows = snaps
      .filter((s) => s.exists)
      .map((s) => s.data() as StudentDirectoryDoc)
      .map((d) => ({ studentId: d.studentId, fullName: d.fullName, email: d.email ?? undefined }));
    const result = rows.length ? await importRoster(classId, rows, me.uid) : null;
    await audit(req, 'class.add_members', 'class', classId, { count: rows.length });
    return { result, missing };
  });

  app.delete('/classes/:classId/members/:uid', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    await requireClassManager(currentUser(req), classId);
    await removeMember(classId, uid);
    await audit(req, 'class.remove_member', 'class', classId, { uid });
    return { ok: true };
  });

  app.patch('/classes/:classId/members/:uid', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    await requireClassManager(currentUser(req), classId);
    const { role } = parse(updateMemberSchema, req.body);
    const ref = C.members(classId).doc(uid);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as MemberDoc).status !== 'active') throw notFound();
    await ref.update({ role, updatedAt: now() });
    await audit(req, 'class.member_role', 'class', classId, { uid, role });
    return { ok: true };
  });

  app.post('/classes/:classId/members/:uid/move', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    const me = currentUser(req);
    const { toClassId } = parse(moveMemberSchema, req.body);
    if (toClassId === classId) throw badRequest('Lớp đích trùng lớp hiện tại');
    await requireClassManager(me, classId);
    await requireClassManager(me, toClassId);
    const user = (await C.user(uid).get()).data() as UserDoc | undefined;
    if (!user) throw notFound();
    await removeMember(classId, uid);
    await addRegisteredMember(toClassId, user, me.uid);
    await audit(req, 'class.move_member', 'class', classId, { uid, toClassId });
    return { ok: true };
  });

  // ----- Enrollment requests -----
  app.post('/enrollment-requests', async (req) => {
    const me = currentUser(req);
    const input = parse(
      z.object({ classCode: z.string().trim().toUpperCase().min(1).max(40).optional(), classId: z.string().max(64).optional() }).merge(enrollmentRequestSchema),
      req.body,
    );
    let cls: ClassDoc | undefined;
    if (input.classId) {
      cls = (await C.class(input.classId).get()).data() as ClassDoc | undefined;
    } else if (input.classCode) {
      const snap = await C.classes()
        .where('tenantId', '==', config.tenantId)
        .where('classCode', '==', input.classCode)
        .where('status', '==', 'active')
        .get();
      cls = snap.docs.map((d) => d.data() as ClassDoc).sort((a, b) => (String(a.semester) < String(b.semester) ? 1 : -1))[0];
    }
    if (!cls || cls.status !== 'active') throw notFound('Không tìm thấy lớp học phần đang hoạt động với mã này');
    const member = await C.members(cls.classId).doc(me.uid).get();
    if (member.exists && (member.data() as MemberDoc).status === 'active') throw conflict('Bạn đã ở trong lớp này');
    const ref = C.enrollmentRequests(cls.classId).doc(me.uid);
    const existing = await ref.get();
    if (existing.exists && (existing.data() as EnrollmentRequestDoc).status === 'pending') {
      return { classId: cls.classId, className: `${cls.classCode} – ${cls.name}`, status: 'pending' };
    }
    await ref.set({
      uid: me.uid,
      classId: cls.classId,
      studentId: me.studentId,
      displayName: me.displayName,
      message: input.message,
      status: 'pending',
      createdAt: now(),
      decidedBy: null,
      decidedAt: null,
    });
    await notify(cls.lecturerIds, {
      type: 'enrollment_request',
      title: 'Yêu cầu tham gia lớp mới',
      body: `${me.displayName} (${me.studentId ?? ''}) xin tham gia lớp ${cls.classCode}`,
      link: `/teach/classes/${cls.classId}/students`,
    });
    return { classId: cls.classId, className: `${cls.classCode} – ${cls.name}`, status: 'pending' };
  });

  app.get('/classes/:classId/enrollment-requests', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await C.enrollmentRequests(classId).where('status', '==', 'pending').get();
    return { items: serialize(snap.docs.map((d) => d.data())) };
  });

  app.post('/classes/:classId/enrollment-requests/:uid/decide', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    const me = currentUser(req);
    const a = await requireClassManager(me, classId);
    const { approve } = parse(decideEnrollmentSchema, req.body);
    const ref = C.enrollmentRequests(classId).doc(uid);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as EnrollmentRequestDoc).status !== 'pending') throw notFound('Không có yêu cầu đang chờ');
    if (approve) {
      const user = (await C.user(uid).get()).data() as UserDoc | undefined;
      if (!user || user.status !== 'active') throw badRequest('Tài khoản sinh viên không hợp lệ');
      await addRegisteredMember(classId, user, me.uid);
      await notify([uid], {
        type: 'enrollment_approved',
        title: 'Đã được duyệt vào lớp',
        body: `Bạn đã được thêm vào lớp ${a.cls.classCode} – ${a.cls.name}`,
        link: `/classes/${classId}`,
      });
    }
    await ref.update({ status: approve ? 'approved' : 'rejected', decidedBy: me.uid, decidedAt: now() });
    await audit(req, approve ? 'class.approve_request' : 'class.reject_request', 'class', classId, { uid });
    return { ok: true };
  });
}
