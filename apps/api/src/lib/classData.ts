import type {
  ActivityDoc,
  ClassDoc,
  ClassStatsDoc,
  MemberDoc,
  PostAuthorDoc,
  PostDoc,
  SessionDoc,
  SessionStatsDoc,
  StudentClassMetricsDoc,
  StudentSessionMetricsDoc,
} from '@classinteract/shared';
import { consistency, deriveParticipation, safeRate } from '@classinteract/shared';
import { db } from '../firebase';
import { C } from './paths';

export const UNTAGGED = 'Chưa phân loại';

export type PostWithAuthor = PostDoc & { authorUid: string | null };

/** All posts of a class with their (private) author uid. Fine for class-sized data sets. */
export async function loadClassPosts(classId: string): Promise<PostWithAuthor[]> {
  const [posts, authors] = await Promise.all([
    db.collectionGroup('posts').where('classId', '==', classId).get(),
    db.collectionGroup('postAuthor').where('classId', '==', classId).get(),
  ]);
  const authorByPost = new Map(authors.docs.map((d) => [(d.data() as PostAuthorDoc).postId, d.data() as PostAuthorDoc]));
  return posts.docs.map((d) => {
    const p = d.data() as PostDoc;
    return { ...p, authorUid: authorByPost.get(p.postId)?.authorUid ?? p.authorId };
  });
}

export async function loadSessionsWithStats(classId: string) {
  const snap = await C.sessions(classId).orderBy('sessionNumber').get();
  const sessions = snap.docs.map((d) => d.data() as SessionDoc);
  const stats = sessions.length ? await db.getAll(...sessions.map((s) => C.sessionStats(classId, s.sessionId))) : [];
  return sessions.map((s, i) => ({ ...s, stats: (stats[i]?.data() as SessionStatsDoc | undefined) ?? null }));
}

export async function loadStudents(classId: string) {
  const [members, metrics] = await Promise.all([
    C.members(classId).where('status', '==', 'active').get(),
    C.studentMetrics(classId).get(),
  ]);
  const metricByUid = new Map(metrics.docs.map((d) => [d.id, d.data() as StudentClassMetricsDoc]));
  return members.docs
    .map((d) => d.data() as MemberDoc)
    .sort((a, b) => ((a.studentId ?? '') < (b.studentId ?? '') ? -1 : 1))
    .map((m) => ({ member: m, metrics: metricByUid.get(m.uid) ?? null }));
}

export async function loadClassStats(classId: string) {
  return ((await C.classStats(classId).get()).data() as ClassStatsDoc | undefined) ?? null;
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Per-topic aggregation. Replies inherit the topics of their thread. */
export function aggregateTopics(posts: PostWithAuthor[]) {
  const visible = posts.filter((p) => p.moderationStatus === 'visible');
  const rootTopics = new Map(visible.filter((p) => p.isRoot).map((p) => [p.postId, p.topics?.length ? p.topics : [UNTAGGED]]));
  const map = new Map<string, { topic: string; questions: number; answers: number; comments: number; openQuestions: number; participants: Set<string>; sessions: Set<string> }>();
  for (const p of visible) {
    const topics = p.isRoot ? rootTopics.get(p.postId)! : (rootTopics.get(p.rootPostId ?? '') ?? [UNTAGGED]);
    for (const t of topics) {
      const e = map.get(t) ?? { topic: t, questions: 0, answers: 0, comments: 0, openQuestions: 0, participants: new Set(), sessions: new Set() };
      if (p.type === 'question') e.questions++;
      else if (p.type === 'answer') e.answers++;
      else e.comments++;
      if (p.type === 'question' && (p.status === 'new' || p.status === 'need_clarification')) e.openQuestions++;
      if (p.authorUid && p.authorRole === 'student') e.participants.add(p.authorUid);
      e.sessions.add(p.sessionId);
      map.set(t, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, participants: e.participants.size, sessions: e.sessions.size }))
    .sort((a, b) => b.questions + b.answers - (a.questions + a.answers));
}

export function interactionsOf(m: Partial<StudentClassMetricsDoc> | null) {
  if (!m) return 0;
  return n(m.questions) + n(m.answers) + n(m.comments) + n(m.reflections) + n(m.activitiesCompleted) + n(m.reactions);
}

/** Student table rows with derived, opportunity-based indicators. */
export function studentRows(
  students: Awaited<ReturnType<typeof loadStudents>>,
  stats: ClassStatsDoc | null,
  topicsByUid: Map<string, Set<string>>,
) {
  const sessionsHeld = n(stats?.sessionsHeld);
  const activitiesOpened = n(stats?.activityCount);
  return students.map(({ member, metrics }) => {
    const m = metrics ?? ({} as Partial<StudentClassMetricsDoc>);
    const counts = {
      sessionsJoined: n(m.sessionsJoined),
      questions: n(m.questions),
      answers: n(m.answers),
      comments: n(m.comments),
      reflections: n(m.reflections),
      activitiesCompleted: n(m.activitiesCompleted),
      quizzesAnswered: n(m.quizzesAnswered),
      quizCorrect: n(m.quizCorrect),
    };
    const d = deriveParticipation(counts, { sessionsHeld, activitiesOpened });
    return {
      uid: member.uid,
      studentId: member.studentId,
      displayName: member.displayName,
      memberRole: member.role,
      ...counts,
      reactions: n(m.reactions),
      pollsAnswered: n(m.pollsAnswered),
      acceptedAnswers: n(m.acceptedAnswers),
      openQuestions: n(m.openQuestions),
      sessionsInteracted: n(m.sessionsInteracted),
      topicsCovered: topicsByUid.get(member.uid)?.size ?? 0,
      interactions: interactionsOf(m),
      attendanceRate: d.attendanceRate,
      activityCompletionRate: d.activityCompletionRate,
      quizAccuracy: d.quizAccuracy,
      consistency: consistency(n(m.sessionsInteracted), sessionsHeld),
      lastActiveAt: m.lastActiveAt ?? null,
    };
  });
}

export function topicsByStudent(posts: PostWithAuthor[]) {
  const rootTopics = new Map(posts.filter((p) => p.isRoot).map((p) => [p.postId, p.topics ?? []]));
  const map = new Map<string, Set<string>>();
  for (const p of posts) {
    if (p.moderationStatus !== 'visible' || !p.authorUid) continue;
    const topics = p.isRoot ? p.topics : (rootTopics.get(p.rootPostId ?? '') ?? []);
    if (!topics?.length) continue;
    const s = map.get(p.authorUid) ?? new Set<string>();
    topics.forEach((t) => s.add(t));
    map.set(p.authorUid, s);
  }
  return map;
}

export async function loadStudentSessionMetrics(classId: string) {
  const snap = await C.studentSessionMetrics(classId).get();
  return snap.docs.map((d) => d.data() as StudentSessionMetricsDoc);
}

export async function loadSessionActivities(classId: string, sessionId: string) {
  const snap = await C.activities(classId, sessionId).orderBy('createdAt').get();
  const acts = snap.docs.map((d) => d.data() as ActivityDoc);
  const results = acts.length ? await db.getAll(...acts.map((a) => C.activityResults(classId, sessionId, a.activityId))) : [];
  return acts.map((a, i) => ({ ...a, results: results[i]?.data() ?? null }));
}

/** Opportunity-based completion: submissions / (activities opened × attendees) over sessions. */
export function classCompletionRate(sessions: { stats: SessionStatsDoc | null }[]) {
  let done = 0;
  let possible = 0;
  for (const s of sessions) {
    if (!s.stats) continue;
    done += n(s.stats.submissionCount);
    possible += n(s.stats.activityCount) * n(s.stats.attendeeCount);
  }
  return safeRate(done, possible);
}

export const classLabel = (c: ClassDoc) => `${c.classCode} – ${c.name}`;
