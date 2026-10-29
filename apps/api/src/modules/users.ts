import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ClassDoc, MemberDoc, UserDoc } from '@classinteract/shared';
import {
  canAssignRole,
  createStaffSchema,
  isAdminRole,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserProfileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from '@classinteract/shared';
import { auth, db, now } from '../firebase';
import { createStaffAccount, ensureAuthUser, searchKey } from '../lib/accounts';
import { audit } from '../lib/audit';
import { currentUser, requireAdmin, requireStaff } from '../lib/auth';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { tempPassword } from '../lib/ids';
import { hashPassword } from '../lib/password';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';

async function getUserOr404(uid: string) {
  const snap = await C.user(uid).get();
  if (!snap.exists) throw notFound('Không tìm thấy người dùng');
  return snap.data() as UserDoc;
}

/** Lecturers may manage students that belong to one of their classes. */
async function lecturerTeachesStudent(lecturerUid: string, studentUid: string) {
  const classes = await C.classes().where('lecturerIds', 'array-contains', lecturerUid).get();
  if (classes.empty) return false;
  const refs = classes.docs.map((d) => C.members(d.id).doc(studentUid));
  const members = await db.getAll(...refs);
  return members.some((m) => m.exists && (m.data() as MemberDoc).status === 'active');
}

/** Blocks access immediately: disables Auth user and revokes all refresh tokens. */
export async function setAccountStatus(uid: string, displayName: string, disabled: boolean) {
  await ensureAuthUser(uid, displayName);
  await auth.updateUser(uid, { disabled });
  if (disabled) await auth.revokeRefreshTokens(uid);
}

export default async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: requireAdmin }, async (req) => {
    const q = parse(listUsersQuerySchema, req.query);
    let docs: UserDoc[];
    if (q.q) {
      // Prefix search on student ID, email and accent-free name, then filter.
      const term = q.q.trim();
      const upper = term.toUpperCase();
      const lower = searchKey(term);
      const [bySid, byName, byEmail] = await Promise.all([
        C.users().where('studentId', '>=', upper).where('studentId', '<=', upper + '').limit(q.limit).get(),
        C.users().where('searchName', '>=', lower).where('searchName', '<=', lower + '').limit(q.limit).get(),
        C.users().where('email', '>=', term.toLowerCase()).where('email', '<=', term.toLowerCase() + '').limit(q.limit).get(),
      ]);
      const map = new Map<string, UserDoc>();
      [...bySid.docs, ...byName.docs, ...byEmail.docs].forEach((d) => map.set(d.id, d.data() as UserDoc));
      docs = [...map.values()].filter((u) => (!q.role || u.role === q.role) && (!q.status || u.status === q.status));
      return { items: serialize(docs), nextCursor: null };
    }
    let query = C.users().orderBy('createdAt', 'desc');
    if (q.role) query = C.users().where('role', '==', q.role).orderBy('createdAt', 'desc');
    if (q.status) query = query.where('status', '==', q.status);
    if (q.cursor) {
      const cur = await C.user(q.cursor).get();
      if (cur.exists) query = query.startAfter(cur);
    }
    const snap = await query.limit(q.limit + 1).get();
    docs = snap.docs.slice(0, q.limit).map((d) => d.data() as UserDoc);
    return { items: serialize(docs), nextCursor: snap.docs.length > q.limit ? docs[docs.length - 1]?.uid : null };
  });

  app.get('/users/:id', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    const me = currentUser(req);
    const user = await getUserOr404(id);
    if (!isAdminRole(me.role) && me.uid !== id && !(await lecturerTeachesStudent(me.uid, id))) throw forbidden();
    const memberships = await db.collectionGroup('members').where('uid', '==', id).get();
    const classIds = memberships.docs.map((d) => (d.data() as MemberDoc).classId);
    const classes = classIds.length ? await db.getAll(...classIds.map((c) => C.class(c))) : [];
    let teaching: ClassDoc[] = [];
    if (user.role !== 'student') {
      const t = await C.classes().where('lecturerIds', 'array-contains', id).get();
      teaching = t.docs.map((d) => d.data() as ClassDoc);
    }
    return serialize({
      user,
      memberships: memberships.docs.map((d) => d.data()),
      classes: classes.filter((c) => c.exists).map((c) => c.data()),
      teaching,
    });
  });

  app.post('/users', { preHandler: requireAdmin }, async (req) => {
    const input = parse(createStaffSchema, req.body);
    const me = currentUser(req);
    if (!canAssignRole(me.role, input.role)) throw forbidden('Bạn không được cấp vai trò này');
    const uid = await createStaffAccount({ ...input, mustChangePassword: true });
    await audit(req, 'user.create', 'user', uid, { role: input.role, email: input.email });
    return { uid };
  });

  app.patch('/users/:id', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { displayName } = parse(updateUserProfileSchema, req.body);
    await getUserOr404(id);
    await C.user(id).update({ displayName, searchName: searchKey(displayName), updatedAt: now() });
    await audit(req, 'user.update_profile', 'user', id, { displayName });
    return { ok: true };
  });

  app.patch('/users/:id/status', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = parse(updateUserStatusSchema, req.body);
    const me = currentUser(req);
    if (id === me.uid) throw badRequest('Không thể tự khóa tài khoản của mình');
    const target = await getUserOr404(id);
    if (target.role === 'superadmin' && me.role !== 'superadmin') throw forbidden();
    await setAccountStatus(id, target.displayName, status === 'disabled');
    await C.user(id).update({ status, updatedAt: now() });
    await audit(req, status === 'disabled' ? 'user.disable' : 'user.enable', 'user', id, { from: target.status, to: status });
    return { ok: true };
  });

  app.patch('/users/:id/role', { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { role } = parse(updateUserRoleSchema, req.body);
    const me = currentUser(req);
    if (id === me.uid) throw badRequest('Không thể tự đổi vai trò của mình');
    const target = await getUserOr404(id);
    if (!canAssignRole(me.role, role) || !canAssignRole(me.role, target.role)) throw forbidden();
    if ((target.role === 'student') !== (role === 'student')) {
      throw badRequest('Không thể chuyển giữa tài khoản sinh viên và tài khoản cán bộ');
    }
    await C.user(id).update({ role, updatedAt: now() });
    await auth.revokeRefreshTokens(id);
    await audit(req, 'user.change_role', 'user', id, { from: target.role, to: role });
    return { ok: true };
  });

  /** Admin, or a lecturer for a student of their class, sets a temporary password. */
  app.post('/users/:id/reset-password', { preHandler: requireStaff }, async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const me = currentUser(req);
    const { newPassword } = parse(resetPasswordSchema, req.body);
    const target = await getUserOr404(id);
    const allowed =
      (isAdminRole(me.role) && (target.role !== 'superadmin' || me.role === 'superadmin')) ||
      (me.role === 'lecturer' && target.role === 'student' && (await lecturerTeachesStudent(me.uid, id)));
    if (!allowed) throw forbidden();
    const password = newPassword ?? tempPassword();
    await C.credentials(id).set(
      { passwordHash: await hashPassword(password), failedCount: 0, lockedUntil: null, updatedAt: now() },
      { merge: true },
    );
    await C.user(id).update({ mustChangePassword: true, updatedAt: now() });
    await ensureAuthUser(id, target.displayName);
    await auth.revokeRefreshTokens(id);
    await audit(req, 'user.reset_password', 'user', id);
    return { temporaryPassword: password };
  });
}
