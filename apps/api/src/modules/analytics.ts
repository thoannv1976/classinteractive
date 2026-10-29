import type { FastifyInstance } from 'fastify';
import type { ClassDoc, MemberDoc, PostAuthorDoc, PostDoc, StudentClassMetricsDoc } from '@classinteract/shared';
import { OPEN_QUESTION_STATUSES, deriveParticipation, consistency } from '@classinteract/shared';
import { z } from 'zod';
import { db } from '../firebase';
import { loadClassAccess, requireClassModerator } from '../lib/access';
import { currentUser } from '../lib/auth';
import {
  UNTAGGED,
  aggregateTopics,
  classCompletionRate,
  interactionsOf,
  loadClassPosts,
  loadClassStats,
  loadSessionActivities,
  loadSessionsWithStats,
  loadStudentSessionMetrics,
  loadStudents,
  studentRows,
  topicsByStudent,
} from '../lib/classData';
import { forbidden, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { serialize, toMillis } from '../lib/time';

const BUCKETS = [
  { label: '0', min: 0, max: 0 },
  { label: '1–2', min: 1, max: 2 },
  { label: '3–5', min: 3, max: 5 },
  { label: '6–10', min: 6, max: 10 },
  { label: '>10', min: 11, max: Infinity },
];

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/classes/:classId/analytics/overview', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await requireClassModerator(currentUser(req), classId);
    const [stats, sessions, students, posts] = await Promise.all([
      loadClassStats(classId),
      loadSessionsWithStats(classId),
      loadStudents(classId),
      loadClassPosts(classId),
    ]);
    const learners = students.filter((s) => s.member.role === 'student' || s.member.role === 'ta');
    const interactions = learners.map((s) => interactionsOf(s.metrics));
    const interacted = interactions.filter((x) => x > 0).length;
    return serialize({
      class: a.cls,
      stats,
      totals: {
        students: learners.length,
        interacted,
        notInteracted: learners.length - interacted,
        interactionRate: learners.length ? interacted / learners.length : null,
        completionRate: classCompletionRate(sessions),
      },
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        sessionNumber: s.sessionNumber,
        title: s.title,
        date: s.date,
        status: s.status,
        stats: s.stats,
      })),
      distribution: BUCKETS.map((b) => ({ label: b.label, count: interactions.filter((x) => x >= b.min && x <= b.max).length })),
      topics: aggregateTopics(posts).slice(0, 15),
    });
  });

  app.get('/classes/:classId/analytics/students', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const [stats, students, posts, ssm, sessions] = await Promise.all([
      loadClassStats(classId),
      loadStudents(classId),
      loadClassPosts(classId),
      loadStudentSessionMetrics(classId),
      loadSessionsWithStats(classId),
    ]);
    const rows = studentRows(students, stats, topicsByStudent(posts));
    const heldSessions = sessions.filter((s) => s.startedAt);
    // Heatmap: interactions per student per session
    const matrix: Record<string, Record<string, number>> = {};
    for (const m of ssm) {
      const v = (m.questions ?? 0) + (m.answers ?? 0) + (m.comments ?? 0) + (m.reflections ?? 0) + (m.activitiesCompleted ?? 0) + (m.reactions ?? 0);
      (matrix[m.uid] ??= {})[m.sessionId] = v;
    }
    const joined: Record<string, string[]> = {};
    for (const m of ssm) if (m.joined) (joined[m.uid] ??= []).push(m.sessionId);
    return serialize({
      rows,
      sessions: heldSessions.map((s) => ({ sessionId: s.sessionId, sessionNumber: s.sessionNumber, title: s.title, date: s.date })),
      heatmap: matrix,
      joined,
      opportunities: { sessionsHeld: stats?.sessionsHeld ?? 0, activitiesOpened: stats?.activityCount ?? 0 },
    });
  });

  /** Individual learning profile – the student themself or class staff. */
  app.get('/classes/:classId/analytics/students/:uid', async (req) => {
    const { classId, uid } = req.params as { classId: string; uid: string };
    const me = currentUser(req);
    const a = await loadClassAccess(me, classId);
    if (uid !== me.uid && !a.canModerate) throw forbidden('Bạn chỉ xem được hồ sơ của chính mình');
    const member = (await C.members(classId).doc(uid).get()).data() as MemberDoc | undefined;
    if (!member) throw notFound('Sinh viên không thuộc lớp');
    const [metricsSnap, stats, sessions, ssmSnap, authorSnap] = await Promise.all([
      C.studentMetrics(classId).doc(uid).get(),
      loadClassStats(classId),
      loadSessionsWithStats(classId),
      C.studentSessionMetrics(classId).where('uid', '==', uid).get(),
      db.collectionGroup('postAuthor').where('classId', '==', classId).where('authorUid', '==', uid).get(),
    ]);
    const authors = authorSnap.docs.map((d) => d.data() as PostAuthorDoc);
    const postSnaps = authors.length
      ? await db.getAll(...authors.map((x) => C.posts(x.classId, x.sessionId).doc(x.postId)))
      : [];
    const posts = postSnaps.filter((s) => s.exists).map((s) => s.data() as PostDoc);
    posts.sort((x, y) => (toMillis(y.createdAt) ?? 0) - (toMillis(x.createdAt) ?? 0));
    const metrics = (metricsSnap.data() as StudentClassMetricsDoc | undefined) ?? null;
    const m = metrics ?? ({} as Partial<StudentClassMetricsDoc>);
    const derived = deriveParticipation(
      {
        sessionsJoined: m.sessionsJoined ?? 0,
        questions: m.questions ?? 0,
        answers: m.answers ?? 0,
        comments: m.comments ?? 0,
        reflections: m.reflections ?? 0,
        activitiesCompleted: m.activitiesCompleted ?? 0,
        quizzesAnswered: m.quizzesAnswered ?? 0,
        quizCorrect: m.quizCorrect ?? 0,
      },
      { sessionsHeld: stats?.sessionsHeld ?? 0, activitiesOpened: stats?.activityCount ?? 0 },
    );
    const perSession = new Map(ssmSnap.docs.map((d) => [d.data().sessionId as string, d.data()]));
    const topics = new Set<string>();
    posts.forEach((p) => p.moderationStatus === 'visible' && p.topics?.forEach((t) => topics.add(t)));
    return serialize({
      class: a.cls,
      member,
      metrics,
      derived: { ...derived, consistency: consistency(m.sessionsInteracted ?? 0, stats?.sessionsHeld ?? 0) },
      sessions: sessions
        .filter((s) => s.startedAt)
        .map((s) => ({ sessionId: s.sessionId, sessionNumber: s.sessionNumber, title: s.title, date: s.date, metrics: perSession.get(s.sessionId) ?? null })),
      topics: [...topics],
      posts: posts.slice(0, 200).map((p) => ({
        postId: p.postId,
        sessionId: p.sessionId,
        type: p.type,
        content: p.content,
        topics: p.topics,
        status: p.status,
        isAccepted: p.isAccepted,
        isAnonymous: p.isAnonymous,
        moderationStatus: p.moderationStatus,
        rootPostId: p.rootPostId,
        voteCount: p.voteCount,
        replyCount: p.replyCount,
        createdAt: p.createdAt,
      })),
    });
  });

  app.get('/classes/:classId/analytics/topics', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const q = parse(z.object({ topic: z.string().max(80).optional(), sessionId: z.string().max(64).optional() }), req.query);
    let posts = await loadClassPosts(classId);
    if (q.sessionId) posts = posts.filter((p) => p.sessionId === q.sessionId);
    const topics = aggregateTopics(posts);
    if (!q.topic) return serialize({ topics });
    const roots = posts.filter(
      (p) => p.isRoot && p.moderationStatus === 'visible' && (q.topic === UNTAGGED ? !p.topics?.length : p.topics?.includes(q.topic!)),
    );
    const ids = new Set(roots.map((r) => r.postId));
    const replies = posts.filter((p) => !p.isRoot && p.moderationStatus === 'visible' && ids.has(p.rootPostId ?? ''));
    const strip = ({ authorUid: _a, ...p }: (typeof posts)[number]) => p;
    return serialize({
      topics,
      threads: roots.map((r) => ({ ...strip(r), replies: replies.filter((x) => x.rootPostId === r.postId).map(strip) })),
    });
  });

  app.get('/classes/:classId/sessions/:sessionId/analytics', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    await requireClassModerator(currentUser(req), classId);
    const [sessionSnap, statsSnap, att, ssm, activities, open] = await Promise.all([
      C.session(classId, sessionId).get(),
      C.sessionStats(classId, sessionId).get(),
      C.attendance(classId, sessionId).get(),
      C.studentSessionMetrics(classId).where('sessionId', '==', sessionId).get(),
      loadSessionActivities(classId, sessionId),
      C.posts(classId, sessionId).where('type', '==', 'question').where('status', 'in', [...OPEN_QUESTION_STATUSES]).get(),
    ]);
    if (!sessionSnap.exists) throw notFound();
    const metricByUid = new Map(ssm.docs.map((d) => [d.data().uid as string, d.data()]));
    return serialize({
      session: sessionSnap.data(),
      stats: statsSnap.data() ?? null,
      attendance: att.docs.map((d) => ({ ...d.data(), metrics: metricByUid.get(d.id) ?? null })),
      activities,
      openQuestions: open.docs.map((d) => d.data()).filter((p) => p.moderationStatus === 'visible'),
    });
  });

  /** "My participation" across all my classes. */
  app.get('/me/participation', async (req) => {
    const me = currentUser(req);
    const m = await db.collectionGroup('members').where('uid', '==', me.uid).where('status', '==', 'active').get();
    const classIds = m.docs.map((d) => (d.data() as MemberDoc).classId);
    if (!classIds.length) return { items: [] };
    const [classes, metrics, stats] = await Promise.all([
      db.getAll(...classIds.map((c) => C.class(c))),
      db.getAll(...classIds.map((c) => C.studentMetrics(c).doc(me.uid))),
      db.getAll(...classIds.map((c) => C.classStats(c))),
    ]);
    return serialize({
      items: classIds.map((id, i) => {
        const met = (metrics[i]?.data() as StudentClassMetricsDoc | undefined) ?? null;
        const st = stats[i]?.data();
        const x = met ?? ({} as Partial<StudentClassMetricsDoc>);
        return {
          class: classes[i]?.data() as ClassDoc,
          metrics: met,
          derived: deriveParticipation(
            {
              sessionsJoined: x.sessionsJoined ?? 0,
              questions: x.questions ?? 0,
              answers: x.answers ?? 0,
              comments: x.comments ?? 0,
              reflections: x.reflections ?? 0,
              activitiesCompleted: x.activitiesCompleted ?? 0,
              quizzesAnswered: x.quizzesAnswered ?? 0,
              quizCorrect: x.quizCorrect ?? 0,
            },
            { sessionsHeld: st?.sessionsHeld ?? 0, activitiesOpened: st?.activityCount ?? 0 },
          ),
          opportunities: { sessionsHeld: st?.sessionsHeld ?? 0, activitiesOpened: st?.activityCount ?? 0 },
        };
      }),
    });
  });

  /** Lecturer dashboard: teaching classes with live sessions and pending work. */
  app.get('/teach/overview', async (req) => {
    const me = currentUser(req);
    const snap = await C.classes().where('lecturerIds', 'array-contains', me.uid).get();
    const classes = snap.docs.map((d) => d.data() as ClassDoc).filter((c) => c.status !== 'archived');
    const stats = classes.length ? await db.getAll(...classes.map((c) => C.classStats(c.classId))) : [];
    const live = await Promise.all(
      classes.map((c) => C.sessions(c.classId).where('status', 'in', ['open', 'paused']).get()),
    );
    const pending = await Promise.all(classes.map((c) => C.enrollmentRequests(c.classId).where('status', '==', 'pending').count().get()));
    return serialize({
      items: classes.map((c, i) => ({
        class: c,
        stats: stats[i]?.data() ?? null,
        liveSessions: live[i]!.docs.map((d) => d.data()),
        pendingRequests: pending[i]!.data().count,
      })),
    });
  });
}
