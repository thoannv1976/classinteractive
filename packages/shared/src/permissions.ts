import { ADMIN_ROLES, STAFF_ROLES, type MemberRole, type UserRole } from './constants';

export interface ClassAccessContext {
  uid: string;
  role: UserRole;
  /** lecturerIds of the class */
  lecturerIds: readonly string[];
  /** Active membership role of the user in the class, if any */
  memberRole: MemberRole | null;
}

export const isAdminRole = (role: UserRole) => ADMIN_ROLES.includes(role);
export const isStaffRole = (role: UserRole) => STAFF_ROLES.includes(role);

export const isClassLecturer = (c: ClassAccessContext) => c.lecturerIds.includes(c.uid);

/** Can see the class and its sessions/feed. */
export const canViewClass = (c: ClassAccessContext) =>
  isAdminRole(c.role) || isClassLecturer(c) || c.memberRole !== null;

/** Can manage class info, sessions, activities and members. */
export const canManageClass = (c: ClassAccessContext) => isAdminRole(c.role) || isClassLecturer(c);

/** Can moderate posts, answer officially and see analytics (lecturer, admin, TA). */
export const canModerateClass = (c: ClassAccessContext) => canManageClass(c) || c.memberRole === 'ta';

/** Can see per-student data of the class. */
export const canViewClassAnalytics = (c: ClassAccessContext) => canModerateClass(c);

/** Can take part as a learner (post, react, submit). Staff of the class can also post. */
export const canParticipate = (c: ClassAccessContext) => canViewClass(c);

/** Who may create classes and courses. */
export const canCreateClass = (role: UserRole) => isStaffRole(role);

/** Account administration (enable/disable, roles, staff accounts). */
export const canAdministerUsers = (role: UserRole) => isAdminRole(role);

/** Whether the actor may disable, reset or edit the target account. Admins only manage students and lecturers. */
export const canManageAccount = (actor: UserRole, target: UserRole) =>
  actor === 'superadmin' || (actor === 'admin' && (target === 'student' || target === 'lecturer'));

/** Only a superadmin may grant admin/superadmin roles. */
export const canAssignRole = (actor: UserRole, target: UserRole) => {
  if (actor === 'superadmin') return true;
  if (actor === 'admin') return target === 'student' || target === 'lecturer';
  return false;
};
