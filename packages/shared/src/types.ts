import type {
  ActivityStatus,
  ActivityType,
  AiApprovalStatus,
  AiMode,
  AiProvider,
  AiRunStatus,
  AiTaskType,
  AuthorRole,
  ClassStatus,
  MemberRole,
  MemberStatus,
  ModerationStatus,
  NotificationType,
  PostType,
  QuestionStatus,
  Reaction,
  SessionStatus,
  UserRole,
  UserStatus,
} from './constants';

/**
 * Time values as they appear in documents. Firestore returns Timestamp objects,
 * the REST API returns ISO strings. Use `toDate()` helpers on the client.
 */
export type Time = { seconds: number; nanoseconds: number; toDate?: () => Date } | string | Date;

export interface UserDoc {
  uid: string;
  tenantId: string;
  role: UserRole;
  status: UserStatus;
  displayName: string;
  /** Only for students. Never used as an internal relation key – use uid. */
  studentId: string | null;
  email: string | null;
  mustChangePassword: boolean;
  createdAt: Time;
  updatedAt: Time;
  lastLoginAt: Time | null;
  schemaVersion: number;
}

export interface CourseDoc {
  courseId: string;
  tenantId: string;
  code: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Time;
  updatedAt: Time;
}

export interface ClassSettings {
  /** Students may post anonymously (hidden from other students). */
  allowAnonymous: boolean;
  /** Lecturers may see who wrote an anonymous post (students are told so). */
  revealAnonymousToStaff: boolean;
  /** Minutes after posting during which the author can edit. */
  editWindowMinutes: number;
  aiEnabled: boolean;
  aiMode: AiMode;
  /** Daily number of AI requests for the whole class. */
  aiDailyQuota: number;
  /** Daily number of AI requests per student (student_support mode). */
  aiStudentDailyQuota: number;
  aiProvider: AiProvider | null;
}

export interface ClassDoc {
  classId: string;
  tenantId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  classCode: string;
  name: string;
  semester: string;
  academicYear: string;
  schedule: string;
  lecturerIds: string[];
  lecturerNames: string[];
  status: ClassStatus;
  studentCount: number;
  sessionCount: number;
  settings: ClassSettings;
  createdBy: string;
  createdAt: Time;
  updatedAt: Time;
  schemaVersion: number;
}

export interface MemberDoc {
  uid: string;
  classId: string;
  role: MemberRole;
  status: MemberStatus;
  studentId: string | null;
  displayName: string;
  assignedBy: string;
  assignedAt: Time;
  updatedAt: Time;
}

export interface EnrollmentRequestDoc {
  uid: string;
  classId: string;
  studentId: string | null;
  displayName: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Time;
  decidedBy: string | null;
  decidedAt: Time | null;
}

/** Entry of the student list imported by lecturers. Registration is allowed only for these IDs. */
export interface StudentDirectoryDoc {
  tenantId: string;
  studentId: string;
  fullName: string;
  email: string | null;
  /** Classes the student is assigned to (applied on registration). */
  classIds: string[];
  uid: string | null;
  importedBy: string;
  createdAt: Time;
  updatedAt: Time;
}

export interface SessionDoc {
  sessionId: string;
  classId: string;
  tenantId: string;
  sessionNumber: number;
  title: string;
  description: string;
  topics: string[];
  date: string; // YYYY-MM-DD
  plannedStart: string; // HH:mm
  plannedEnd: string; // HH:mm
  status: SessionStatus;
  joinCode: string | null;
  joinCodeExpiresAt: Time | null;
  startedAt: Time | null;
  endedAt: Time | null;
  /** After closing, replies are still accepted until this time (if set). */
  lateRepliesUntil: Time | null;
  createdBy: string;
  createdAt: Time;
  updatedAt: Time;
}

export interface SessionStatsDoc {
  attendeeCount: number;
  interactedCount: number;
  questionCount: number;
  answerCount: number;
  commentCount: number;
  reflectionCount: number;
  openQuestionCount: number;
  activityCount: number;
  submissionCount: number;
  reactionCount: number;
  updatedAt: Time;
}

export interface AttendanceDoc {
  uid: string;
  studentId: string | null;
  displayName: string;
  joinedAt: Time;
  lastSeenAt: Time;
}

export interface PostDoc {
  postId: string;
  tenantId: string;
  classId: string;
  sessionId: string;
  type: PostType;
  isRoot: boolean;
  parentPostId: string | null;
  rootPostId: string | null;
  activityId: string | null;
  content: string;
  topics: string[];
  /** null when the post is anonymous. */
  authorId: string | null;
  authorName: string;
  authorRole: AuthorRole;
  isAnonymous: boolean;
  isAiGenerated: boolean;
  aiRunId: string | null;
  approvedBy: string | null;
  status: QuestionStatus | null;
  moderationStatus: ModerationStatus;
  isPinned: boolean;
  isAccepted: boolean;
  replyCount: number;
  voteCount: number;
  reactionCounts: Partial<Record<Reaction, number>>;
  createdAt: Time;
  updatedAt: Time;
  editedAt: Time | null;
  schemaVersion: number;
}

/** Private, server-only identity of a post author (needed for anonymous posts and analytics). */
export interface PostAuthorDoc {
  postId: string;
  classId: string;
  sessionId: string;
  authorUid: string;
  authorRole: AuthorRole;
  type: PostType;
  createdAt: Time;
}

export interface ReactionDoc {
  uid: string;
  reaction: Reaction | null;
  upvoted: boolean;
  updatedAt: Time;
}

export interface ActivityOption {
  id: string;
  label: string;
}

export interface ActivityDoc {
  activityId: string;
  classId: string;
  sessionId: string;
  type: ActivityType;
  title: string;
  prompt: string;
  options: ActivityOption[];
  allowMultiple: boolean;
  status: ActivityStatus;
  /** Students can see aggregated results. */
  showResults: boolean;
  /** Set when the lecturer reveals the quiz answer (after closing). */
  revealedCorrectOptionIds: string[] | null;
  openedAt: Time | null;
  closedAt: Time | null;
  createdBy: string;
  createdAt: Time;
  updatedAt: Time;
}

export interface ActivityResultsDoc {
  submissionCount: number;
  optionCounts: Record<string, number>;
  correctCount: number;
  updatedAt: Time;
}

export interface SubmissionDoc {
  uid: string;
  studentId: string | null;
  displayName: string;
  optionIds: string[];
  text: string;
  featured: boolean;
  submittedAt: Time;
  updatedAt: Time;
}

export interface StudentClassMetricsDoc {
  uid: string;
  classId: string;
  studentId: string | null;
  displayName: string;
  sessionsJoined: number;
  /** Sessions in which the student interacted at least once (consistency). */
  sessionsInteracted: number;
  questions: number;
  answers: number;
  comments: number;
  reflections: number;
  reactions: number;
  activitiesCompleted: number;
  pollsAnswered: number;
  quizzesAnswered: number;
  quizCorrect: number;
  acceptedAnswers: number;
  openQuestions: number;
  topics: string[];
  lastActiveAt: Time | null;
  updatedAt: Time;
}

export interface StudentSessionMetricsDoc {
  uid: string;
  classId: string;
  sessionId: string;
  joined: boolean;
  questions: number;
  answers: number;
  comments: number;
  reflections: number;
  reactions: number;
  activitiesCompleted: number;
  updatedAt: Time;
}

export interface ClassStatsDoc {
  sessionsHeld: number;
  questionCount: number;
  answerCount: number;
  commentCount: number;
  reflectionCount: number;
  openQuestionCount: number;
  activityCount: number;
  submissionCount: number;
  updatedAt: Time;
}

export interface NotificationDoc {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Time;
}

export interface AiProviderSettings {
  enabled: boolean;
  model: string;
  /** USD per 1M input/output tokens, used for cost estimation. */
  inputCostPerMTok: number;
  outputCostPerMTok: number;
}

export interface AiSettingsDoc {
  enabled: boolean;
  defaultProvider: AiProvider;
  fallbackOrder: AiProvider[];
  providers: Record<AiProvider, AiProviderSettings>;
  maxOutputTokens: number;
  timeoutMs: number;
  monthlyCostLimitUsd: number;
  updatedAt?: Time;
  updatedBy?: string;
}

export interface AiRunDoc {
  runId: string;
  tenantId: string;
  taskType: AiTaskType;
  provider: AiProvider | null;
  model: string | null;
  requestedBy: string;
  requestedByRole: UserRole;
  classId: string;
  sessionId: string;
  sourceRefs: string[];
  status: AiRunStatus;
  approvalStatus: AiApprovalStatus;
  output: AiAnswerOutput | null;
  publishedPostId: string | null;
  error: string | null;
  attempts: { provider: AiProvider; error: string | null }[];
  tokenUsage: { input: number; output: number };
  estimatedCost: number;
  createdAt: Time;
  completedAt: Time | null;
}

export interface AiAnswerOutput {
  shortAnswer: string;
  explanation: string;
  example: string;
  relatedConcepts: string[];
}

export interface AuditLogDoc {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: Time;
}

/** Public profile returned by GET /auth/me */
export interface MeResponse {
  user: UserDoc;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
