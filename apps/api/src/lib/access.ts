import type { ClassAccessContext, ClassDoc, MemberDoc, UserDoc } from '@classinteract/shared';
import {
  canManageClass,
  canModerateClass,
  canViewClass,
} from '@classinteract/shared';
import { forbidden, notFound } from './errors';
import { C } from './paths';

export interface ClassAccess {
  cls: ClassDoc;
  member: MemberDoc | null;
  ctx: ClassAccessContext;
  canManage: boolean;
  canModerate: boolean;
}

/** Loads a class and the caller's relation to it. Always checked on the server. */
export async function loadClassAccess(user: UserDoc, classId: string): Promise<ClassAccess> {
  const [clsSnap, memberSnap] = await Promise.all([C.class(classId).get(), C.members(classId).doc(user.uid).get()]);
  if (!clsSnap.exists) throw notFound('Không tìm thấy lớp học');
  const cls = clsSnap.data() as ClassDoc;
  const member = memberSnap.exists ? (memberSnap.data() as MemberDoc) : null;
  const activeMember = member && member.status === 'active' ? member : null;
  const ctx: ClassAccessContext = {
    uid: user.uid,
    role: user.role,
    lecturerIds: cls.lecturerIds,
    memberRole: activeMember?.role ?? null,
  };
  if (!canViewClass(ctx)) throw forbidden('Bạn chưa được tham gia lớp này');
  return { cls, member: activeMember, ctx, canManage: canManageClass(ctx), canModerate: canModerateClass(ctx) };
}

export async function requireClassManager(user: UserDoc, classId: string) {
  const a = await loadClassAccess(user, classId);
  if (!a.canManage) throw forbidden('Chỉ giảng viên phụ trách hoặc quản trị viên được thực hiện');
  return a;
}

export async function requireClassModerator(user: UserDoc, classId: string) {
  const a = await loadClassAccess(user, classId);
  if (!a.canModerate) throw forbidden('Chỉ giảng viên hoặc trợ giảng được thực hiện');
  return a;
}

/** Students cannot interact with a locked/archived class. */
export function assertClassWritable(a: ClassAccess) {
  if (a.cls.status !== 'active' && !a.canManage) throw forbidden('Lớp học đã bị khóa');
}
