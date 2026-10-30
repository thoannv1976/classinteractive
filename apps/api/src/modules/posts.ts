import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'firebase-admin/firestore';
import type {
  AuthorRole,
  PostAuthorDoc,
  PostDoc,
  PostType,
  QuestionStatus,
  ReactionDoc,
  SessionDoc,
  UserDoc,
} from '@classinteract/shared';
import {
  OPEN_QUESTION_STATUSES,
  SCHEMA_VERSION,
  createPostSchema,
  createReplySchema,
  editPostSchema,
  isAdminRole,
  isOpenQuestionStatus,
  moderatePostSchema,
  reactSchema,
} from '@classinteract/shared';
import { z } from 'zod';
import { db, inc, now } from '../firebase';
import { type ClassAccess, assertClassWritable, loadClassAccess, requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { assertSessionAccepts, bumpClassStats, bumpSessionStats, prepareParticipation } from '../lib/counters';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { stableId } from '../lib/ids';
import { C } from '../lib/paths';
import { serialize, toMillis } from '../lib/time';
import { notify } from './notifications';

type Params = { classId: string; sessionId: string; postId: string };

/** Which per-student counter a post type increments. */
export const studentKey = (t: PostType) =>
  t === 'question' ? 'questions' : t === 'answer' ? 'answers' : t === 'reflection' ? 'reflections' : 'comments';
/** Which session/class counter a post type increments. */
export const statKey = (t: PostType) =>
  t === 'question'
    ? 'questionCount'
    : t === 'answer'
      ? 'answerCount'
      : t === 'reflection'
        ? 'reflectionCount'
        : 'commentCount';

export function authorRoleFor(user: UserDoc, a: ClassAccess): AuthorRole {
  if (a.canManage && user.role !== 'student') return isAdminRole(user.role) && !a.cls.lecturerIds.includes(user.uid) ? 'admin' : 'lecturer';
  if (a.ctx.memberRole === 'ta') return 'ta';
  return 'student';
}

const isStaffAuthor = (r: AuthorRole) => r === 'lecturer' || r === 'admin' || r === 'ta';

/** Remove control characters but keep new lines and tabs. Content is rendered as text (no HTML). */
const cleanText = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/** Increment helper on a student's class + session metrics without touching identity fields. */
function bumpAuthorCounters(tx: Transaction, classId: string, sessionId: string, uid: string, delta: Record<string, number>, sessionLevel = true) {
  const d: Record<string, unknown> = { updatedAt: now() };
  for (const [k, v] of Object.entries(delta)) if (v) d[k] = inc(v);
  tx.set(C.studentMetrics(classId).doc(uid), d, { merge: true });
  if (sessionLevel) {
    const sd: Record<string, unknown> = { updatedAt: now() };
    for (const [k, v] of Object.entries(delta)) if (v && k !== 'openQuestions' && k !== 'acceptedAnswers') sd[k] = inc(v);
    tx.set(C.studentSessionMetrics(classId).doc(`${sessionId}_${uid}`), sd, { merge: true });
  }
}

async function loadPostForWrite(tx: Transaction, p: Params) {
  const ref = C.posts(p.classId, p.sessionId).doc(p.postId);
  const authorRef = C.postAuthor(p.classId, p.sessionId, p.postId);
  const [snap, authorSnap] = await Promise.all([tx.get(ref), tx.get(authorRef)]);
  if (!snap.exists) throw notFound('Không tìm thấy bài đăng');
  return { ref, post: snap.data() as PostDoc, author: authorSnap.data() as PostAuthorDoc | undefined };
}

export default async function postRoutes(app: FastifyInstance) {
  /** Create a root post (question, reflection, discussion). Idempotent per clientRequestId. */
  app.post('/classes/:classId/sessions/:sessionId/posts', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { classId, sessionId } = req.params as Params;
    const me = currentUser(req);
    const input = parse(createPostSchema, req.body);
    const a = await loadClassAccess(me, classId);
    assertClassWritable(a);
    const authorRole = authorRoleFor(me, a);
    if (input.isAnonymous && (!a.cls.settings.allowAnonymous || authorRole !== 'student')) {
      throw badRequest('Lớp không cho phép đặt câu hỏi ẩn danh');
    }
    const content = cleanText(input.content);
    if (!content) throw badRequest('Nội dung trống');
    const postId = stableId(me.uid, sessionId, input.clientRequestId);
    const ref = C.posts(classId, sessionId).doc(postId);

    const created = await db.runTransaction(async (tx) => {
      const [existing, sSnap] = await Promise.all([tx.get(ref), tx.get(C.session(classId, sessionId))]);
      if (existing.exists) return false;
      if (!sSnap.exists) throw notFound('Không tìm thấy buổi học');
      assertSessionAccepts(sSnap.data() as SessionDoc, 'post');
      const part = await prepareParticipation(tx, { classId, sessionId, user: me });
      const isQuestion = input.type === 'question';
      tx.create(ref, {
        postId,
        tenantId: a.cls.tenantId,
        classId,
        sessionId,
        type: input.type,
        isRoot: true,
        parentPostId: null,
        rootPostId: null,
        activityId: null,
        content,
        topics: input.topics,
        authorId: input.isAnonymous ? null : me.uid,
        authorName: input.isAnonymous ? 'Ẩn danh' : me.displayName,
        authorRole,
        isAnonymous: input.isAnonymous,
        identityRevealable: input.isAnonymous && a.cls.settings.revealAnonymousToStaff,
        isAiGenerated: false,
        aiRunId: null,
        approvedBy: null,
        status: isQuestion ? 'new' : null,
        moderationStatus: 'visible',
        isPinned: false,
        isAccepted: false,
        replyCount: 0,
        voteCount: 0,
        reactionCounts: {},
        createdAt: now(),
        updatedAt: now(),
        editedAt: null,
        schemaVersion: SCHEMA_VERSION,
      });
      tx.create(C.postAuthor(classId, sessionId, postId), {
        postId,
        classId,
        sessionId,
        authorUid: me.uid,
        authorRole,
        type: input.type,
        createdAt: now(),
      });
      const stats = { [statKey(input.type)]: 1, openQuestionCount: isQuestion ? 1 : 0 };
      part.write({ [studentKey(input.type)]: 1 }, { sessionDelta: stats, classDelta: stats, studentExtra: { openQuestions: isQuestion ? 1 : 0 } });
      return true;
    });
    return { postId, duplicate: !created };
  });

  /** Reply (answer or comment) to a root post. */
  app.post('/classes/:classId/sessions/:sessionId/posts/:postId/replies', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const input = parse(createReplySchema, req.body);
    const a = await loadClassAccess(me, p.classId);
    assertClassWritable(a);
    const authorRole = authorRoleFor(me, a);
    if (input.isAnonymous && (!a.cls.settings.allowAnonymous || authorRole !== 'student')) {
      throw badRequest('Lớp không cho phép trả lời ẩn danh');
    }
    const content = cleanText(input.content);
    if (!content) throw badRequest('Nội dung trống');
    const replyId = stableId(me.uid, p.postId, input.clientRequestId);
    const replyRef = C.posts(p.classId, p.sessionId).doc(replyId);

    const outcome = await db.runTransaction(async (tx) => {
      const [existing, sSnap] = await Promise.all([tx.get(replyRef), tx.get(C.session(p.classId, p.sessionId))]);
      if (existing.exists) return null;
      const { ref: parentRef, post: parent, author: parentAuthor } = await loadPostForWrite(tx, p);
      if (!parent.isRoot) throw badRequest('Chỉ trả lời được bài đăng gốc');
      if (parent.moderationStatus !== 'visible' && !a.canModerate) throw notFound('Không tìm thấy bài đăng');
      if (parent.status === 'archived') throw conflict('Câu hỏi đã được lưu trữ');
      if (!sSnap.exists) throw notFound();
      assertSessionAccepts(sSnap.data() as SessionDoc, 'reply');
      const part = await prepareParticipation(tx, { classId: p.classId, sessionId: p.sessionId, user: me });

      tx.create(replyRef, {
        postId: replyId,
        tenantId: a.cls.tenantId,
        classId: p.classId,
        sessionId: p.sessionId,
        type: input.type,
        isRoot: false,
        parentPostId: parent.postId,
        rootPostId: parent.postId,
        activityId: null,
        content,
        topics: parent.topics,
        authorId: input.isAnonymous ? null : me.uid,
        authorName: input.isAnonymous ? 'Ẩn danh' : me.displayName,
        authorRole,
        isAnonymous: input.isAnonymous,
        identityRevealable: input.isAnonymous && a.cls.settings.revealAnonymousToStaff,
        isAiGenerated: false,
        aiRunId: null,
        approvedBy: null,
        status: null,
        moderationStatus: 'visible',
        isPinned: false,
        isAccepted: false,
        replyCount: 0,
        voteCount: 0,
        reactionCounts: {},
        createdAt: now(),
        updatedAt: now(),
        editedAt: null,
        schemaVersion: SCHEMA_VERSION,
      });
      tx.create(C.postAuthor(p.classId, p.sessionId, replyId), {
        postId: replyId,
        classId: p.classId,
        sessionId: p.sessionId,
        authorUid: me.uid,
        authorRole,
        type: input.type,
        createdAt: now(),
      });

      const parentUpdate: Record<string, unknown> = { replyCount: inc(1), updatedAt: now() };
      const stats: Record<string, number> = { [statKey(input.type)]: 1 };
      const answersQuestion =
        isStaffAuthor(authorRole) && input.type === 'answer' && parent.type === 'question' && isOpenQuestionStatus(parent.status);
      if (answersQuestion) {
        parentUpdate.status = 'answered';
        if (parent.moderationStatus === 'visible') {
          stats.openQuestionCount = -1;
          if (parentAuthor?.authorRole === 'student') {
            bumpAuthorCounters(tx, p.classId, p.sessionId, parentAuthor.authorUid, { openQuestions: -1 }, false);
          }
        }
      }
      tx.update(parentRef, parentUpdate);
      part.write({ [studentKey(input.type)]: 1 }, { sessionDelta: stats, classDelta: stats });
      return { parentAuthorUid: parentAuthor?.authorUid ?? null, parent };
    });

    if (outcome?.parentAuthorUid && outcome.parentAuthorUid !== me.uid) {
      const staff = isStaffAuthor(authorRole);
      await notify([outcome.parentAuthorUid], {
        type: staff ? 'lecturer_reply' : 'question_answered',
        title: staff ? 'Giảng viên đã phản hồi bài của bạn' : 'Có phản hồi mới cho bài của bạn',
        body: content.slice(0, 140),
        link: `/classes/${p.classId}/sessions/${p.sessionId}/posts/${p.postId}`,
      });
    }
    return { postId: replyId, duplicate: !outcome };
  });

  /** Author edits own post within the class edit window (moderators any time). */
  app.patch('/classes/:classId/sessions/:sessionId/posts/:postId', async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const input = parse(editPostSchema, req.body);
    const a = await loadClassAccess(me, p.classId);
    await db.runTransaction(async (tx) => {
      const { ref, post, author } = await loadPostForWrite(tx, p);
      const isAuthor = author?.authorUid === me.uid;
      if (!isAuthor && !a.canModerate) throw forbidden('Bạn chỉ được sửa bài của mình');
      if (post.isAiGenerated && !a.canModerate) throw forbidden();
      if (isAuthor && !a.canModerate) {
        const created = toMillis(post.createdAt) ?? 0;
        if (Date.now() - created > a.cls.settings.editWindowMinutes * 60000) {
          throw conflict('Chỉ được sửa trong {{n}} phút sau khi gửi', 'EDIT_WINDOW_PASSED', { n: a.cls.settings.editWindowMinutes });
        }
      }
      const update: Record<string, unknown> = { updatedAt: now(), editedAt: now() };
      if (input.content !== undefined) update.content = cleanText(input.content);
      if (input.topics !== undefined && post.isRoot) update.topics = input.topics;
      tx.update(ref, update);
    });
    return { ok: true };
  });

  /** Author deletes own post (soft delete = hidden) within the edit window. */
  app.delete('/classes/:classId/sessions/:sessionId/posts/:postId', async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const a = await loadClassAccess(me, p.classId);
    await setVisibility(p, a, me, 'hidden', true);
    return { ok: true };
  });

  /** Lecturer / TA moderation: hide, pin, accept answer, set question status, retag. */
  app.patch('/classes/:classId/sessions/:sessionId/posts/:postId/moderation', async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const a = await requireClassModerator(me, p.classId);
    const input = parse(moderatePostSchema, req.body);
    if (input.moderationStatus) await setVisibility(p, a, me, input.moderationStatus, false);
    const notifyAnswerAuthor = await db.runTransaction(async (tx) => {
      const { ref, post, author } = await loadPostForWrite(tx, p);
      let parentData: { ref: FirebaseFirestore.DocumentReference; post: PostDoc; author?: PostAuthorDoc } | null = null;
      if (input.isAccepted !== undefined && !post.isRoot && post.parentPostId) {
        parentData = await loadPostForWrite(tx, { ...p, postId: post.parentPostId });
      }
      const update: Record<string, unknown> = { updatedAt: now() };
      const stats: Record<string, number> = {};
      let accepted = false;
      if (input.isPinned !== undefined) update.isPinned = input.isPinned;
      if (input.topics !== undefined && post.isRoot) update.topics = input.topics;
      if (input.status !== undefined) {
        if (post.type !== 'question') throw badRequest('Chỉ câu hỏi mới có trạng thái xử lý');
        const was = isOpenQuestionStatus(post.status);
        const will = isOpenQuestionStatus(input.status as QuestionStatus);
        update.status = input.status;
        if (post.moderationStatus === 'visible' && was !== will) {
          stats.openQuestionCount = will ? 1 : -1;
          if (author?.authorRole === 'student') bumpAuthorCounters(tx, p.classId, p.sessionId, author.authorUid, { openQuestions: will ? 1 : -1 }, false);
        }
      }
      if (input.isAccepted !== undefined) {
        if (post.type !== 'answer') throw badRequest('Chỉ xác nhận được câu trả lời');
        if (input.isAccepted !== post.isAccepted) {
          update.isAccepted = input.isAccepted;
          update.approvedBy = input.isAccepted ? me.uid : null;
          accepted = input.isAccepted;
          if (author?.authorRole === 'student') {
            bumpAuthorCounters(tx, p.classId, p.sessionId, author.authorUid, { acceptedAnswers: input.isAccepted ? 1 : -1 }, false);
          }
          if (input.isAccepted && parentData && parentData.post.type === 'question' && isOpenQuestionStatus(parentData.post.status)) {
            tx.update(parentData.ref, { status: 'answered', updatedAt: now() });
            if (parentData.post.moderationStatus === 'visible') {
              stats.openQuestionCount = (stats.openQuestionCount ?? 0) - 1;
              if (parentData.author?.authorRole === 'student') {
                bumpAuthorCounters(tx, p.classId, p.sessionId, parentData.author.authorUid, { openQuestions: -1 }, false);
              }
            }
          }
        }
      }
      tx.update(ref, update);
      bumpSessionStats(tx, p.classId, p.sessionId, stats);
      bumpClassStats(tx, p.classId, stats);
      return accepted && author && author.authorUid !== me.uid ? author.authorUid : null;
    });
    if (notifyAnswerAuthor) {
      await notify([notifyAnswerAuthor], {
        type: 'lecturer_reply',
        title: 'Câu trả lời của bạn được giảng viên xác nhận',
        body: 'Giảng viên đã đánh dấu câu trả lời của bạn là phù hợp.',
        bodyTranslatable: true,
        link: `/classes/${p.classId}/sessions/${p.sessionId}`,
      });
    }
    await audit(req, 'post.moderate', 'post', p.postId, { classId: p.classId, ...input });
    return { ok: true };
  });

  /** One-tap reaction (one per user per post, changeable) and/or question upvote. */
  app.post('/classes/:classId/sessions/:sessionId/posts/:postId/reactions', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const input = parse(reactSchema, req.body);
    const a = await loadClassAccess(me, p.classId);
    assertClassWritable(a);
    const result = await db.runTransaction(async (tx) => {
      const ref = C.posts(p.classId, p.sessionId).doc(p.postId);
      const rRef = C.reactions(p.classId, p.sessionId, p.postId).doc(me.uid);
      const [snap, rSnap, sSnap] = await Promise.all([tx.get(ref), tx.get(rRef), tx.get(C.session(p.classId, p.sessionId))]);
      if (!snap.exists || (snap.data() as PostDoc).moderationStatus !== 'visible') throw notFound('Không tìm thấy bài đăng');
      if (!sSnap.exists) throw notFound();
      assertSessionAccepts(sSnap.data() as SessionDoc, 'reply');
      const post = snap.data() as PostDoc;
      if (input.upvoted !== undefined && post.type !== 'question') throw badRequest('Chỉ bình chọn được câu hỏi');
      const part = await prepareParticipation(tx, { classId: p.classId, sessionId: p.sessionId, user: me });
      const old = (rSnap.data() as ReactionDoc | undefined) ?? { reaction: null, upvoted: false };
      const next = {
        reaction: input.reaction !== undefined ? input.reaction : old.reaction,
        upvoted: input.upvoted !== undefined ? input.upvoted : old.upvoted,
      };
      const update: Record<string, unknown> = {};
      if (old.reaction !== next.reaction) {
        if (old.reaction) update[`reactionCounts.${old.reaction}`] = inc(-1);
        if (next.reaction) update[`reactionCounts.${next.reaction}`] = inc(1);
      }
      if (old.upvoted !== next.upvoted) update.voteCount = inc(next.upvoted ? 1 : -1);
      if (Object.keys(update).length) tx.update(ref, update);
      tx.set(rRef, { uid: me.uid, ...next, updatedAt: now() });
      const first = !rSnap.exists && (next.reaction || next.upvoted);
      part.write(first ? { reactions: 1 } : {}, { sessionDelta: first ? { reactionCount: 1 } : {} });
      return next;
    });
    return result;
  });

  /** Reveal the author of an anonymous post – only if the class policy announced it. */
  app.get('/classes/:classId/sessions/:sessionId/posts/:postId/author', async (req) => {
    const p = req.params as Params;
    const me = currentUser(req);
    const a = await requireClassModerator(me, p.classId);
    const [post, author] = await Promise.all([
      C.posts(p.classId, p.sessionId).doc(p.postId).get(),
      C.postAuthor(p.classId, p.sessionId, p.postId).get(),
    ]);
    if (!post.exists || !author.exists) throw notFound();
    const pd = post.data() as PostDoc;
    // Only posts written while the policy was on (and announced to the author) can be revealed.
    if (pd.isAnonymous && !(pd.identityRevealable && a.cls.settings.revealAnonymousToStaff)) {
      throw forbidden('Chính sách lớp không cho phép xem danh tính bài ẩn danh này');
    }
    const u = (await C.user((author.data() as PostAuthorDoc).authorUid).get()).data() as UserDoc | undefined;
    if (pd.isAnonymous) await audit(req, 'post.reveal_author', 'post', p.postId, { classId: p.classId });
    return { uid: u?.uid ?? null, displayName: u?.displayName ?? '', studentId: u?.studentId ?? null };
  });

  /** Unanswered question queue, highest votes first. */
  app.get('/classes/:classId/questions', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const q = parse(z.object({ status: z.enum(['open', 'all']).default('open'), sessionId: z.string().max(64).optional() }), req.query);
    let query = db.collectionGroup('posts').where('classId', '==', classId).where('type', '==', 'question');
    if (q.status === 'open') query = query.where('status', 'in', [...OPEN_QUESTION_STATUSES]);
    if (q.sessionId) query = query.where('sessionId', '==', q.sessionId);
    const snap = await query.limit(500).get();
    const items = snap.docs
      .map((d) => d.data() as PostDoc)
      .filter((p) => p.moderationStatus === 'visible')
      .sort((x, y) => y.voteCount - x.voteCount || (toMillis(x.createdAt) ?? 0) - (toMillis(y.createdAt) ?? 0));
    return { items: serialize(items) };
  });
}

/** Hide / unhide a post and keep every counter consistent. */
async function setVisibility(p: Params, a: ClassAccess, me: UserDoc, status: 'visible' | 'hidden', byAuthor: boolean) {
  await db.runTransaction(async (tx) => {
    const { ref, post, author } = await loadPostForWrite(tx, p);
    let parent: { ref: FirebaseFirestore.DocumentReference; post: PostDoc } | null = null;
    if (!post.isRoot && post.parentPostId) {
      const ps = await tx.get(C.posts(p.classId, p.sessionId).doc(post.parentPostId));
      if (ps.exists) parent = { ref: ps.ref, post: ps.data() as PostDoc };
    }
    if (byAuthor) {
      if (author?.authorUid !== me.uid) throw forbidden('Bạn chỉ được xóa bài của mình');
      const created = toMillis(post.createdAt) ?? 0;
      if (!a.canModerate && Date.now() - created > a.cls.settings.editWindowMinutes * 60000) {
        throw conflict('Chỉ được xóa trong {{n}} phút sau khi gửi', 'EDIT_WINDOW_PASSED', { n: a.cls.settings.editWindowMinutes });
      }
    }
    if (post.moderationStatus === status) return;
    if (!byAuthor && status === 'visible' && (post as PostDoc & { deletedByAuthor?: boolean }).deletedByAuthor) {
      throw conflict('Bài đã được tác giả xóa, không thể hiện lại');
    }
    const sign = status === 'hidden' ? -1 : 1;
    const stats: Record<string, number> = { [statKey(post.type)]: sign };
    const studentDelta: Record<string, number> = { [studentKey(post.type)]: sign };
    if (post.type === 'question' && isOpenQuestionStatus(post.status)) {
      stats.openQuestionCount = sign;
      studentDelta.openQuestions = sign;
    }
    if (post.isAccepted) studentDelta.acceptedAnswers = sign;
    tx.update(ref, { moderationStatus: status, updatedAt: now(), ...(byAuthor ? { deletedByAuthor: true } : {}) });
    if (parent) tx.update(parent.ref, { replyCount: inc(sign) });
    if (author?.authorRole === 'student') bumpAuthorCounters(tx, p.classId, p.sessionId, author.authorUid, studentDelta);
    bumpSessionStats(tx, p.classId, p.sessionId, stats);
    bumpClassStats(tx, p.classId, stats);
  });
}
