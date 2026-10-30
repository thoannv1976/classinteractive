import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  AI_MODES,
  AI_PROVIDERS,
  AI_TASK_TYPES,
  EMBEDDING_PROVIDERS,
  CLASS_STATUSES,
  LIMITS,
  MEMBER_ROLES,
  POST_TYPES,
  QUESTION_STATUSES,
  REACTIONS,
  ROOT_POST_TYPES,
  STUDENT_ID_REGEX,
  USER_ROLES,
  USER_STATUSES,
  type PostType,
} from './constants';

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, msg = 'Không được để trống') => z.string().trim().min(1, msg).max(max);

export const studentIdSchema = z
  .string()
  .trim()
  .regex(STUDENT_ID_REGEX, 'Mã sinh viên chỉ gồm chữ, số, dấu chấm, gạch (3–32 ký tự)')
  .transform((v) => v.toUpperCase());

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự`)
  .max(LIMITS.passwordMax, 'Mật khẩu quá dài');

export const emailSchema = z.string().trim().toLowerCase().email('Email không hợp lệ');

/** Idempotency key sent by clients for create operations (safe retries). */
export const clientRequestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'clientRequestId không hợp lệ');

// ---------- Auth ----------
export const languageSchema = z.enum(['vi', 'en']);

export const registerSchema = z.object({
  studentId: studentIdSchema,
  password: passwordSchema,
  language: languageSchema.optional(),
});

export const updateMeSchema = z.object({ language: languageSchema });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Student ID for students, email for staff. */
  loginId: z.string().trim().min(1, 'Nhập mã sinh viên hoặc email').max(254),
  password: z.string().min(1, 'Nhập mật khẩu').max(LIMITS.passwordMax),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});

export const bootstrapSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: requiredText(100),
});

// ---------- Users ----------
export const createStaffSchema = z.object({
  email: emailSchema,
  displayName: requiredText(100),
  role: z.enum(['lecturer', 'admin']),
  password: passwordSchema,
});

export const updateUserStatusSchema = z.object({ status: z.enum(USER_STATUSES) });
export const updateUserRoleSchema = z.object({ role: z.enum(USER_ROLES) });
export const updateUserProfileSchema = z.object({ displayName: requiredText(100) });
export const resetPasswordSchema = z.object({ newPassword: passwordSchema.optional() });

export const listUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  classId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

// ---------- Courses / classes ----------
export const courseSchema = z.object({
  code: requiredText(30).transform((v) => v.toUpperCase()),
  name: requiredText(200),
  description: trimmed(2000).default(''),
});

export const classSettingsSchema = z.object({
  allowAnonymous: z.boolean(),
  revealAnonymousToStaff: z.boolean(),
  editWindowMinutes: z.number().int().min(0).max(1440),
  aiEnabled: z.boolean(),
  aiMode: z.enum(AI_MODES),
  aiDailyQuota: z.number().int().min(0).max(10000),
  aiStudentDailyQuota: z.number().int().min(0).max(100),
  aiProvider: z.enum(AI_PROVIDERS).nullable(),
  showScoreToStudents: z.boolean().optional(),
  autoAiOnSessionEnd: z.boolean().optional(),
});

export const createClassSchema = z.object({
  courseId: z.string().min(1).max(64),
  classCode: requiredText(40).transform((v) => v.toUpperCase()),
  name: trimmed(200).default(''),
  semester: requiredText(40),
  academicYear: requiredText(20),
  schedule: trimmed(200).default(''),
  lecturerIds: z.array(z.string().min(1).max(128)).max(10).optional(),
});

export const updateClassSchema = z.object({
  name: trimmed(200).optional(),
  semester: requiredText(40).optional(),
  academicYear: requiredText(20).optional(),
  schedule: trimmed(200).optional(),
  status: z.enum(CLASS_STATUSES).optional(),
  lecturerIds: z.array(z.string().min(1).max(128)).min(1).max(10).optional(),
  settings: classSettingsSchema.partial().optional(),
});

export const rosterRowSchema = z.object({
  studentId: studentIdSchema,
  fullName: requiredText(120, 'Thiếu họ tên'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type RosterRow = z.infer<typeof rosterRowSchema>;

export const importRosterSchema = z.object({
  rows: z.array(z.unknown()).min(1, 'Danh sách trống').max(LIMITS.importRowsMax),
});

export const addMembersSchema = z.object({
  studentIds: z.array(studentIdSchema).min(1).max(LIMITS.importRowsMax),
});

export const updateMemberSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export const moveMemberSchema = z.object({ toClassId: z.string().min(1).max(64) });

export const enrollmentRequestSchema = z.object({ message: trimmed(500).default('') });
export const decideEnrollmentSchema = z.object({ approve: z.boolean() });

// ---------- Sessions ----------
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ (YYYY-MM-DD)');
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ (HH:mm)');

export const createSessionSchema = z.object({
  title: requiredText(LIMITS.titleMax),
  description: trimmed(3000).default(''),
  topics: z.array(requiredText(80)).max(30).default([]),
  date: dateStr,
  plannedStart: timeStr.default('07:00'),
  plannedEnd: timeStr.default('09:00'),
  sessionNumber: z.number().int().min(1).max(999).optional(),
});

export const updateSessionSchema = createSessionSchema.partial();

export const endSessionSchema = z.object({
  /** Allow late replies for N minutes after closing (0 = none). */
  lateReplyMinutes: z.number().int().min(0).max(60 * 24 * 14).default(0),
});

export const joinByCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,10}$/, 'Mã tham gia không hợp lệ'),
});

// ---------- Posts ----------
export const createPostSchema = z.object({
  type: z.enum(ROOT_POST_TYPES as [PostType, ...PostType[]]).default('question'),
  content: requiredText(LIMITS.postContentMax, 'Nội dung trống'),
  topics: z.array(requiredText(80)).max(5).default([]),
  isAnonymous: z.boolean().default(false),
  clientRequestId: clientRequestIdSchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const createReplySchema = z.object({
  type: z.enum(['answer', 'comment']).default('answer'),
  content: requiredText(LIMITS.postContentMax, 'Nội dung trống'),
  isAnonymous: z.boolean().default(false),
  clientRequestId: clientRequestIdSchema,
});

export const editPostSchema = z.object({
  content: requiredText(LIMITS.postContentMax, 'Nội dung trống').optional(),
  topics: z.array(requiredText(80)).max(5).optional(),
});

export const reactSchema = z
  .object({
    reaction: z.enum(REACTIONS).nullable().optional(),
    upvoted: z.boolean().optional(),
  })
  .refine((v) => v.reaction !== undefined || v.upvoted !== undefined, 'Thiếu reaction hoặc upvoted');

export const moderatePostSchema = z.object({
  moderationStatus: z.enum(['visible', 'hidden']).optional(),
  isPinned: z.boolean().optional(),
  isAccepted: z.boolean().optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  topics: z.array(requiredText(80)).max(5).optional(),
});

export const listPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
});

// ---------- Activities ----------
const optionLabel = requiredText(300, 'Phương án trống');

export const createActivitySchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    title: requiredText(LIMITS.titleMax),
    prompt: trimmed(3000).default(''),
    options: z.array(optionLabel).max(LIMITS.activityOptionsMax).default([]),
    /** Indexes (0-based) into options for quiz answers. */
    correctOptionIndexes: z.array(z.number().int().min(0)).max(LIMITS.activityOptionsMax).default([]),
    allowMultiple: z.boolean().default(false),
    showResults: z.boolean().default(true),
    openNow: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if ((v.type === 'poll' || v.type === 'quiz') && v.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Cần ít nhất 2 phương án' });
    }
    if (v.type === 'quiz' && v.correctOptionIndexes.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIndexes'], message: 'Chọn đáp án đúng' });
    }
    if (v.correctOptionIndexes.some((i) => i >= v.options.length)) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIndexes'], message: 'Đáp án không hợp lệ' });
    }
  });
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  showResults: z.boolean().optional(),
  revealAnswer: z.boolean().optional(),
});

export const submitActivitySchema = z.object({
  optionIds: z.array(z.string().max(40)).max(LIMITS.activityOptionsMax).default([]),
  text: trimmed(LIMITS.freeTextMax).default(''),
  answers: z.array(trimmed(1000)).max(3).default([]),
  clientRequestId: clientRequestIdSchema,
});

export const featureSubmissionSchema = z.object({ featured: z.boolean() });

// ---------- AI ----------
export const aiAnswerSchema = z.object({
  classId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  postId: z.string().min(1).max(64),
  provider: z.enum(AI_PROVIDERS).optional(),
});

export const publishAiRunSchema = z.object({
  content: requiredText(LIMITS.postContentMax),
});

// ---------- Phase 2: topics, clusters, summaries, scores, jobs ----------
const topicName = requiredText(80, 'Tên chủ đề trống');
const postRef = z.object({ sessionId: z.string().min(1).max(64), postId: z.string().min(1).max(64) });

export const createTopicSchema = z.object({ name: topicName, description: trimmed(500).default('') });
export const updateTopicSchema = z.object({ name: topicName.optional(), description: trimmed(500).optional() });
export const mergeTopicsSchema = z.object({ from: z.array(topicName).min(1).max(20), into: topicName });
export const moveTopicPostsSchema = z.object({
  posts: z.array(postRef).min(1).max(500),
  remove: topicName.optional(),
  add: z.array(topicName).max(5).default([]),
});
export const topicReviewSchema = z.object({
  items: z
    .array(postRef.extend({ action: z.enum(['accept', 'reject', 'edit']), topics: z.array(topicName).max(5).optional() }))
    .min(1)
    .max(500),
});

export const startJobSchema = z.object({
  type: z.enum(['classify_topics', 'cluster_questions', 'summarize_session', 'summarize_activity', 'teaching_insights']),
  sessionId: z.string().max(64).optional(),
  activityId: z.string().max(64).optional(),
  scope: z.enum(['session', 'class']).optional(),
  force: z.boolean().optional(),
});

export const updateClusterSchema = z.object({
  name: requiredText(200).optional(),
  description: trimmed(1000).optional(),
  status: z.enum(['open', 'resolved']).optional(),
});
export const mergeClustersSchema = z.object({ ids: z.array(z.string().max(64)).min(2).max(20), name: requiredText(200).optional() });
export const moveClusterItemSchema = z.object({
  item: postRef,
  toClusterId: z.string().max(64).nullable(),
  /** Only this group loses the question (groups of other scopes are not touched). */
  fromClusterId: z.string().max(64).optional(),
});

const summaryItem = z.object({ text: requiredText(1500), refs: z.array(z.string().max(64)).max(30).default([]) });
export const summarySectionsSchema = z.object({
  mainContent: trimmed(4000),
  topicsDiscussed: z.array(summaryItem).max(30),
  keyQuestions: z.array(summaryItem).max(30),
  confirmedAnswers: z.array(summaryItem).max(30),
  unresolved: z.array(summaryItem).max(30),
  difficulties: z.array(summaryItem).max(30),
  popular: z.array(summaryItem).max(30),
  nextSession: z.array(summaryItem).max(30),
});
export const updateSummarySchema = z.object({
  sections: summarySectionsSchema.optional(),
  status: z.enum(['draft', 'approved']).optional(),
  published: z.boolean().optional(),
});

export const scoreConfigSchema = z
  .object({
    weights: z.object({
      activities: z.number().int().min(0).max(100),
      answers: z.number().int().min(0).max(100),
      questions: z.number().int().min(0).max(100),
      helpful: z.number().int().min(0).max(100),
      exitTickets: z.number().int().min(0).max(100),
    }),
    caps: z.object({
      answers: z.number().int().min(1).max(20),
      questions: z.number().int().min(1).max(20),
      helpful: z.number().int().min(1).max(20),
    }),
    basis: z.enum(['held', 'attended']),
  })
  .refine((v) => Object.values(v.weights).reduce((a, b) => a + b, 0) === 100, 'Tổng trọng số phải bằng 100%');

export const scoreAdjustmentSchema = z.object({ delta: z.number().min(-100).max(100), note: trimmed(500).default('') });

const providerSettingsSchema = z.object({
  enabled: z.boolean(),
  model: requiredText(100),
  inputCostPerMTok: z.number().min(0).max(1000),
  outputCostPerMTok: z.number().min(0).max(1000),
});

/** API key of an AI provider ('' removes it). */
export const apiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .max(400, 'API key quá dài')
    .refine((v) => v === '' || (v.length >= 20 && !/\s/.test(v)), 'API key không hợp lệ'),
});

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultProvider: z.enum(AI_PROVIDERS),
  fallbackOrder: z.array(z.enum(AI_PROVIDERS)).max(3),
  providers: z.object({
    openai: providerSettingsSchema,
    anthropic: providerSettingsSchema,
    gemini: providerSettingsSchema,
  }),
  maxOutputTokens: z.number().int().min(100).max(8000),
  timeoutMs: z.number().int().min(5000).max(120000),
  monthlyCostLimitUsd: z.number().min(0).max(100000),
  taskModels: z
    .partialRecord(z.enum(AI_TASK_TYPES), z.object({ provider: z.enum(AI_PROVIDERS).nullable(), model: z.string().trim().max(100).nullable() }))
    .optional(),
  embedding: z
    .object({ provider: z.enum(EMBEDDING_PROVIDERS).nullable(), model: requiredText(100), threshold: z.number().min(0.3).max(0.99) })
    .optional(),
});

// ---------- Helpers ----------
export const isReplyType = (t: PostType) => t === 'answer' || t === 'comment';
export const postTypeSchema = z.enum(POST_TYPES);
