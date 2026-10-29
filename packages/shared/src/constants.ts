/** Global roles stored on the user profile. */
export const USER_ROLES = ['student', 'lecturer', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STAFF_ROLES: readonly UserRole[] = ['lecturer', 'admin', 'superadmin'];
export const ADMIN_ROLES: readonly UserRole[] = ['admin', 'superadmin'];

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Role of a user inside one class (membership). */
export const MEMBER_ROLES = ['student', 'ta'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ['active', 'removed'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CLASS_STATUSES = ['active', 'locked', 'archived'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const SESSION_STATUSES = ['draft', 'open', 'paused', 'closed', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const POST_TYPES = ['question', 'answer', 'comment', 'reflection', 'discussion'] as const;
export type PostType = (typeof POST_TYPES)[number];
/** Post types that start a thread (shown in the feed). */
export const ROOT_POST_TYPES: readonly PostType[] = ['question', 'reflection', 'discussion'];
/** Post types that reply to a thread. */
export const REPLY_POST_TYPES: readonly PostType[] = ['answer', 'comment'];

export const QUESTION_STATUSES = ['new', 'answered', 'need_clarification', 'resolved', 'archived'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
/** Questions in these states are still waiting for the lecturer. */
export const OPEN_QUESTION_STATUSES: readonly QuestionStatus[] = ['new', 'need_clarification'];
export const isOpenQuestionStatus = (s: QuestionStatus | null | undefined) =>
  !!s && OPEN_QUESTION_STATUSES.includes(s);

export const MODERATION_STATUSES = ['visible', 'hidden'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const AUTHOR_ROLES = ['student', 'ta', 'lecturer', 'admin', 'ai'] as const;
export type AuthorRole = (typeof AUTHOR_ROLES)[number];

/** One-tap reactions. A user holds at most one reaction per post. */
export const REACTIONS = ['agree', 'disagree', 'helpful', 'same_question', 'need_explanation', 'understood'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const ACTIVITY_TYPES = ['free_text', 'poll', 'quiz', 'understanding'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ['draft', 'open', 'closed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Fixed options of the one-click understanding check. */
export const UNDERSTANDING_OPTIONS = [
  { id: 'understood', label: 'Đã hiểu' },
  { id: 'partial', label: 'Hiểu một phần' },
  { id: 'not_yet', label: 'Chưa hiểu' },
] as const;

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_TASK_TYPES = ['answer'] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export const AI_RUN_STATUSES = ['pending', 'completed', 'failed'] as const;
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

export const AI_APPROVAL_STATUSES = ['draft', 'published', 'rejected', 'auto_published'] as const;
export type AiApprovalStatus = (typeof AI_APPROVAL_STATUSES)[number];

/** assistant = draft for lecturer review (default); student_support = AI may answer students directly. */
export const AI_MODES = ['assistant', 'student_support'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const NOTIFICATION_TYPES = [
  'session_opened',
  'activity_opened',
  'question_answered',
  'lecturer_reply',
  'enrollment_approved',
  'enrollment_request',
  'ai_answer',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEFAULT_TENANT_ID = 'default';
export const SCHEMA_VERSION = 1;

export const LIMITS = {
  postContentMax: 5000,
  postContentMin: 1,
  titleMax: 200,
  passwordMin: 6,
  passwordMax: 128,
  importRowsMax: 1000,
  activityOptionsMax: 10,
  freeTextMax: 3000,
  feedPageSize: 50,
  loginMaxFailures: 5,
  loginLockMinutes: 5,
} as const;

/** Student IDs: letters, digits, dot, dash, underscore. Stored upper-case. */
export const STUDENT_ID_REGEX = /^[A-Za-z0-9._-]{3,32}$/;
export const normalizeStudentId = (id: string) => id.trim().toUpperCase();
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
