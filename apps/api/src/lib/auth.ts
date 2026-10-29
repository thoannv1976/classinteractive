import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserDoc, UserRole } from '@classinteract/shared';
import { isAdminRole, isStaffRole } from '@classinteract/shared';
import { auth } from '../firebase';
import { AppError, forbidden, unauthorized } from './errors';
import { C } from './paths';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserDoc;
  }
}

/** Verifies the Firebase ID token (incl. revocation) and loads the active user profile. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const m = /^Bearer (.+)$/.exec(header);
  if (!m?.[1]) throw unauthorized();
  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(m[1], true);
    uid = decoded.uid;
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('revoked') || code.includes('user-disabled')) {
      throw new AppError(401, 'SESSION_REVOKED', 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
    }
    throw unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  const snap = await C.user(uid).get();
  if (!snap.exists) throw unauthorized('Tài khoản không tồn tại');
  const user = snap.data() as UserDoc;
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa');
  req.user = user;
}

export function currentUser(req: FastifyRequest): UserDoc {
  if (!req.user) throw unauthorized();
  return req.user;
}

export const requireRole =
  (...roles: UserRole[]) =>
  async (req: FastifyRequest) => {
    const u = currentUser(req);
    if (!roles.includes(u.role)) throw forbidden();
  };

export const requireStaff = async (req: FastifyRequest) => {
  if (!isStaffRole(currentUser(req).role)) throw forbidden();
};

export const requireAdmin = async (req: FastifyRequest) => {
  if (!isAdminRole(currentUser(req).role)) throw forbidden();
};
