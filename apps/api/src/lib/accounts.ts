import type { UserDoc, UserRole } from '@classinteract/shared';
import { SCHEMA_VERSION, normalizeEmail } from '@classinteract/shared';
import { config } from '../config';
import { auth, db, now } from '../firebase';
import { conflict } from './errors';
import { loginKey } from './ids';
import { hashPassword } from './password';
import { C } from './paths';

/** Lower-case, accent-free version of a name for prefix search. */
export function searchKey(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Creates a staff account (lecturer/admin/superadmin) that logs in with email + password. */
export async function createStaffAccount(input: {
  email: string;
  displayName: string;
  role: Extract<UserRole, 'lecturer' | 'admin' | 'superadmin'>;
  password: string;
  mustChangePassword?: boolean;
}) {
  const email = normalizeEmail(input.email);
  const loginRef = C.userLogins().doc(loginKey(config.tenantId, 'email', email));
  if ((await loginRef.get()).exists) throw conflict('Email đã được sử dụng', 'EMAIL_EXISTS');
  const uid = C.users().doc().id;
  const passwordHash = await hashPassword(input.password);
  await auth.createUser({ uid, displayName: input.displayName });
  const user: Omit<UserDoc, 'createdAt' | 'updatedAt'> & Record<string, unknown> = {
    uid,
    tenantId: config.tenantId,
    role: input.role,
    status: 'active',
    displayName: input.displayName,
    searchName: searchKey(input.displayName),
    studentId: null,
    email,
    mustChangePassword: input.mustChangePassword ?? false,
    lastLoginAt: null,
    schemaVersion: SCHEMA_VERSION,
  };
  try {
    await db.runTransaction(async (tx) => {
      const l = await tx.get(loginRef);
      if (l.exists) throw conflict('Email đã được sử dụng', 'EMAIL_EXISTS');
      tx.create(loginRef, { uid, kind: 'email', value: email, tenantId: config.tenantId });
      tx.create(C.user(uid), { ...user, createdAt: now(), updatedAt: now() });
      tx.create(C.credentials(uid), { passwordHash, failedCount: 0, lockedUntil: null, updatedAt: now() });
    });
  } catch (e) {
    await auth.deleteUser(uid).catch(() => undefined);
    throw e;
  }
  return uid;
}

/** Makes sure a Firebase Auth user exists for this uid (accounts created before Auth was available). */
export async function ensureAuthUser(uid: string, displayName: string) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, displayName });
  }
}
