import type { FastifyInstance } from 'fastify';
import type { ClassDoc, StudentDirectoryDoc, UserDoc } from '@classinteract/shared';
import {
  LIMITS,
  SCHEMA_VERSION,
  changePasswordSchema,
  loginSchema,
  normalizeEmail,
  normalizeStudentId,
  registerSchema,
  updateMeSchema,
} from '@classinteract/shared';
import { config } from '../config';
import { Timestamp, auth, db, inc, now } from '../firebase';
import { searchKey } from '../lib/accounts';
import { audit } from '../lib/audit';
import { authenticate, currentUser } from '../lib/auth';
import { AppError, conflict, parse } from '../lib/errors';
import { directoryKey, loginKey } from '../lib/ids';
import { fakeVerify, hashPassword, verifyPassword } from '../lib/password';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Mã sinh viên/email hoặc mật khẩu không đúng');

// Per IP. Generous because a classroom shares one public IP; brute force is stopped by the
// per-account lockout (LIMITS.loginMaxFailures).
const strictLimit = { rateLimit: { max: 300, timeWindow: '1 minute' } };
const passwordChangeLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export default async function authRoutes(app: FastifyInstance) {
  /** Student self-registration: student ID must be in a list imported by a lecturer/admin. */
  app.post('/auth/register', { config: strictLimit }, async (req) => {
    const { studentId, password, language } = parse(registerSchema, req.body);
    const tenantId = config.tenantId;
    const dirRef = C.studentDirectory().doc(directoryKey(tenantId, studentId));
    const loginRef = C.userLogins().doc(loginKey(tenantId, 'sid', studentId));

    const dirSnap = await dirRef.get();
    if (!dirSnap.exists) {
      throw new AppError(
        403,
        'NOT_IN_ROSTER',
        'Mã sinh viên chưa có trong danh sách lớp. Vui lòng liên hệ giảng viên để được thêm vào danh sách.',
      );
    }
    if ((dirSnap.data() as StudentDirectoryDoc).uid) {
      throw conflict('Mã sinh viên này đã được đăng ký. Hãy đăng nhập.', 'ALREADY_REGISTERED');
    }

    const passwordHash = await hashPassword(password);
    const uid = C.users().doc().id;
    const displayName = (dirSnap.data() as StudentDirectoryDoc).fullName;
    await auth.createUser({ uid, displayName });

    let user: Record<string, unknown>;
    try {
      user = await db.runTransaction(async (tx) => {
        const [d, l] = await Promise.all([tx.get(dirRef), tx.get(loginRef)]);
        const dir = d.data() as StudentDirectoryDoc | undefined;
        if (!dir) throw new AppError(403, 'NOT_IN_ROSTER', 'Mã sinh viên chưa có trong danh sách lớp');
        if (dir.uid || l.exists) throw conflict('Mã sinh viên này đã được đăng ký. Hãy đăng nhập.', 'ALREADY_REGISTERED');
        const classSnaps = await Promise.all(dir.classIds.map((id) => tx.get(C.class(id))));
        const memberSnaps = await Promise.all(dir.classIds.map((id) => tx.get(C.members(id).doc(uid))));

        const userDoc = {
          uid,
          tenantId,
          role: 'student',
          status: 'active',
          displayName: dir.fullName,
          searchName: searchKey(dir.fullName),
          studentId,
          email: dir.email ?? null,
          mustChangePassword: false,
          language: language ?? 'vi',
          lastLoginAt: now(),
          schemaVersion: SCHEMA_VERSION,
          createdAt: now(),
          updatedAt: now(),
        };
        tx.create(loginRef, { uid, kind: 'sid', value: studentId, tenantId });
        tx.create(C.user(uid), userDoc);
        tx.create(C.credentials(uid), { passwordHash, failedCount: 0, lockedUntil: null, updatedAt: now() });
        tx.update(dirRef, { uid, updatedAt: now() });
        classSnaps.forEach((cs, i) => {
          if (!cs.exists || memberSnaps[i]?.exists) return;
          const cls = cs.data() as ClassDoc;
          tx.create(C.members(cls.classId).doc(uid), {
            uid,
            classId: cls.classId,
            role: 'student',
            status: 'active',
            studentId,
            displayName: dir.fullName,
            searchName: searchKey(dir.fullName),
            assignedBy: dir.importedBy,
            assignedAt: now(),
            updatedAt: now(),
          });
          tx.update(C.class(cls.classId), { studentCount: inc(1) });
        });
        return userDoc;
      });
    } catch (e) {
      await auth.deleteUser(uid).catch(() => undefined);
      throw e;
    }
    await audit(req, 'auth.register', 'user', uid, { studentId }, { uid, displayName, role: 'student' });
    const token = await auth.createCustomToken(uid);
    const fresh = await C.user(uid).get();
    return { token, user: serialize(fresh.data() ?? user) };
  });

  /** Login with student ID (students) or email (staff). Returns a Firebase custom token. */
  app.post('/auth/login', { config: strictLimit }, async (req) => {
    const { loginId, password } = parse(loginSchema, req.body);
    const isEmail = loginId.includes('@');
    const key = isEmail
      ? loginKey(config.tenantId, 'email', normalizeEmail(loginId))
      : loginKey(config.tenantId, 'sid', normalizeStudentId(loginId));
    const loginSnap = await C.userLogins().doc(key).get();
    if (!loginSnap.exists) {
      await fakeVerify(password);
      throw invalidCredentials();
    }
    const uid = loginSnap.data()!.uid as string;
    const credRef = C.credentials(uid);
    const [credSnap, userSnap] = await Promise.all([credRef.get(), C.user(uid).get()]);
    const cred = credSnap.data();
    const user = userSnap.data() as UserDoc | undefined;
    if (!cred || !user) throw invalidCredentials();

    const lockedUntil = cred.lockedUntil as Timestamp | null;
    if (lockedUntil && lockedUntil.toMillis() > Date.now()) {
      const minutes = Math.ceil((lockedUntil.toMillis() - Date.now()) / 60000);
      throw new AppError(429, 'ACCOUNT_LOCKED', 'Bạn đã nhập sai nhiều lần. Vui lòng thử lại sau {{minutes}} phút.', undefined, { minutes });
    }

    const ok = await verifyPassword(cred.passwordHash as string, password);
    if (!ok) {
      const locked = await db.runTransaction(async (tx) => {
        const c = (await tx.get(credRef)).data() ?? {};
        const failed = ((c.failedCount as number) ?? 0) + 1;
        if (failed >= LIMITS.loginMaxFailures) {
          tx.update(credRef, {
            failedCount: 0,
            lockedUntil: Timestamp.fromMillis(Date.now() + LIMITS.loginLockMinutes * 60000),
          });
          return true;
        }
        tx.update(credRef, { failedCount: failed });
        return false;
      });
      if (locked) await audit(req, 'auth.locked', 'user', uid, { reason: 'too_many_failures' }, { uid, displayName: user.displayName, role: user.role });
      throw invalidCredentials();
    }
    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }
    await Promise.all([
      credRef.update({ failedCount: 0, lockedUntil: null }),
      C.user(uid).update({ lastLoginAt: now() }),
    ]);
    const token = await auth.createCustomToken(uid);
    return { token, user: serialize(user) };
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req) => ({ user: serialize(currentUser(req)) }));

  /** Personal preferences (UI language). */
  app.patch('/auth/me', { preHandler: authenticate }, async (req) => {
    const u = currentUser(req);
    const { language } = parse(updateMeSchema, req.body);
    await C.user(u.uid).update({ language, updatedAt: now() });
    return { ok: true };
  });

  /** Change own password. Other sessions are signed out; a fresh token is returned for this device. */
  app.post('/auth/change-password', { preHandler: authenticate, config: passwordChangeLimit }, async (req) => {
    const u = currentUser(req);
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    const cred = (await C.credentials(u.uid).get()).data();
    if (!cred || !(await verifyPassword(cred.passwordHash as string, currentPassword))) {
      throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
    }
    if (currentPassword === newPassword) throw new AppError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu cũ');
    await C.credentials(u.uid).update({ passwordHash: await hashPassword(newPassword), updatedAt: now() });
    await C.user(u.uid).update({ mustChangePassword: false, updatedAt: now() });
    await auth.revokeRefreshTokens(u.uid);
    await audit(req, 'auth.change_password', 'user', u.uid);
    // Revocation is second-granular: wait so the new token is issued after it.
    await new Promise((r) => setTimeout(r, 1100));
    return { token: await auth.createCustomToken(u.uid) };
  });
}
