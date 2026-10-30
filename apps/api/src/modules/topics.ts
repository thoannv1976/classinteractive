import type { FastifyInstance } from 'fastify';
import type { PostDoc, SessionDoc, TopicDoc } from '@classinteract/shared';
import { createTopicSchema, mergeTopicsSchema, moveTopicPostsSchema, topicReviewSchema, updateTopicSchema } from '@classinteract/shared';
import { db, now } from '../firebase';
import { loadClassAccess, requireClassModerator } from '../lib/access';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { UNTAGGED, aggregateTopics, loadClassPosts } from '../lib/classData';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';

const topicsCol = (classId: string) => C.class(classId).collection('topics');
const norm = (s: string) => s.trim().toLowerCase();

export async function loadCatalog(classId: string) {
  const snap = await topicsCol(classId).get();
  return snap.docs.map((d) => d.data() as TopicDoc);
}

/** All topic names known in a class: catalog + session topics + topics used on posts. */
export async function classTopicNames(classId: string) {
  const [catalog, sessions] = await Promise.all([loadCatalog(classId), C.sessions(classId).get()]);
  const names = new Map<string, string>();
  catalog.forEach((t) => names.set(norm(t.name), t.name));
  sessions.docs.forEach((d) => (d.data() as SessionDoc).topics?.forEach((t) => names.has(norm(t)) || names.set(norm(t), t)));
  return { catalog, names: [...names.values()] };
}

export async function ensureCatalogTopic(classId: string, name: string, source: TopicDoc['source'], by: string, description = '') {
  const existing = await topicsCol(classId).where('name', '==', name).limit(1).get();
  if (!existing.empty) return existing.docs[0]!.data() as TopicDoc;
  const ref = topicsCol(classId).doc();
  const doc = { topicId: ref.id, classId, name, description, source, createdBy: by, createdAt: now(), updatedAt: now() };
  await ref.set(doc);
  return doc as unknown as TopicDoc;
}

/**
 * Rewrites topic names on posts, AI suggestions and sessions. mapping: old name → new name
 * (null = remove). Replies inherit topics from their thread, so they are updated too.
 */
export async function rewriteTopics(classId: string, mapping: Map<string, string | null>) {
  const olds = [...mapping.keys()];
  if (!olds.length) return 0;
  const apply = (arr: string[] | null | undefined) => {
    if (!arr) return arr ?? null;
    const out: string[] = [];
    for (const t of arr) {
      const m = mapping.has(t) ? mapping.get(t) : t;
      if (m && !out.includes(m)) out.push(m);
    }
    return out;
  };
  let changed = 0;
  for (let i = 0; i < olds.length; i += 30) {
    const chunk = olds.slice(i, i + 30);
    const [byTopics, byAi] = await Promise.all([
      db.collectionGroup('posts').where('classId', '==', classId).where('topics', 'array-contains-any', chunk).get(),
      db.collectionGroup('posts').where('classId', '==', classId).where('aiTopics', 'array-contains-any', chunk).get(),
    ]);
    const docs = new Map([...byTopics.docs, ...byAi.docs].map((d) => [d.ref.path, d]));
    let batch = db.batch();
    let n = 0;
    for (const d of docs.values()) {
      const p = d.data() as PostDoc;
      batch.update(d.ref, { topics: apply(p.topics) ?? [], aiTopics: apply(p.aiTopics), updatedAt: now() });
      changed++;
      if (++n >= 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
    if (n) await batch.commit();
  }
  const sessions = await C.sessions(classId).get();
  const batch = db.batch();
  sessions.docs.forEach((d) => {
    const s = d.data() as SessionDoc;
    if (s.topics?.some((t) => mapping.has(t))) batch.update(d.ref, { topics: apply(s.topics), updatedAt: now() });
  });
  await batch.commit();
  return changed;
}

export default async function topicRoutes(app: FastifyInstance) {
  /** Topic catalog with statistics (merged with names used in sessions/posts). */
  app.get('/classes/:classId/topics', async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await loadClassAccess(currentUser(req), classId);
    const { catalog, names } = await classTopicNames(classId);
    if (!a.canModerate) return { items: names.map((name) => ({ name })) };
    const posts = await loadClassPosts(classId);
    const stats = new Map(aggregateTopics(posts).map((t) => [t.topic, t]));
    const pendingAi = new Map<string, number>();
    posts.forEach((p) => p.topicReview === 'pending' && p.aiTopics?.forEach((t) => pendingAi.set(t, (pendingAi.get(t) ?? 0) + 1)));
    const all = new Set([...names, ...[...stats.keys()].filter((t) => t !== UNTAGGED)]);
    const byName = new Map(catalog.map((c) => [c.name, c]));
    const items = [...all].map((name) => ({
      name,
      topicId: byName.get(name)?.topicId ?? null,
      description: byName.get(name)?.description ?? '',
      source: byName.get(name)?.source ?? 'session',
      questions: stats.get(name)?.questions ?? 0,
      answers: stats.get(name)?.answers ?? 0,
      comments: stats.get(name)?.comments ?? 0,
      openQuestions: stats.get(name)?.openQuestions ?? 0,
      participants: stats.get(name)?.participants ?? 0,
      sessions: stats.get(name)?.sessions ?? 0,
      pendingAi: pendingAi.get(name) ?? 0,
    }));
    items.sort((x, y) => y.questions + y.answers - (x.questions + x.answers) || x.name.localeCompare(y.name));
    const untagged = stats.get(UNTAGGED);
    return serialize({ items, untagged: untagged ? { questions: untagged.questions, answers: untagged.answers } : null });
  });

  app.post('/classes/:classId/topics', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const input = parse(createTopicSchema, req.body);
    const t = await ensureCatalogTopic(classId, input.name, 'lecturer', me.uid, input.description);
    await audit(req, 'topic.create', 'class', classId, { name: input.name });
    return serialize(t);
  });

  /** Rename (updates every post and session) and/or describe a topic. */
  app.patch('/classes/:classId/topics/:name', async (req) => {
    const { classId, name } = req.params as { classId: string; name: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const input = parse(updateTopicSchema, req.body);
    const t = await ensureCatalogTopic(classId, decodeURIComponent(name), 'session', me.uid);
    let changed = 0;
    if (input.name && input.name !== t.name) {
      const clash = await topicsCol(classId).where('name', '==', input.name).limit(1).get();
      if (!clash.empty) throw conflict('Chủ đề này đã tồn tại. Hãy dùng chức năng gộp chủ đề.');
      changed = await rewriteTopics(classId, new Map([[t.name, input.name]]));
    }
    await topicsCol(classId).doc(t.topicId).update({ ...input, updatedAt: now() });
    await audit(req, 'topic.update', 'class', classId, { from: t.name, ...input });
    return { ok: true, postsUpdated: changed };
  });

  app.delete('/classes/:classId/topics/:name', async (req) => {
    const { classId, name } = req.params as { classId: string; name: string };
    await requireClassModerator(currentUser(req), classId);
    const topic = decodeURIComponent(name);
    const changed = await rewriteTopics(classId, new Map([[topic, null]]));
    const docs = await topicsCol(classId).where('name', '==', topic).get();
    await Promise.all(docs.docs.map((d) => d.ref.delete()));
    await audit(req, 'topic.delete', 'class', classId, { name: topic });
    return { ok: true, postsUpdated: changed };
  });

  app.post('/classes/:classId/topics/merge', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const { from, into } = parse(mergeTopicsSchema, req.body);
    const sources = from.filter((f) => f !== into);
    if (!sources.length) throw badRequest('Chọn ít nhất một chủ đề khác để gộp');
    await ensureCatalogTopic(classId, into, 'lecturer', me.uid);
    const changed = await rewriteTopics(classId, new Map(sources.map((s) => [s, into])));
    for (const s of sources) {
      const docs = await topicsCol(classId).where('name', '==', s).get();
      await Promise.all(docs.docs.map((d) => d.ref.delete()));
    }
    await audit(req, 'topic.merge', 'class', classId, { from: sources, into });
    return { ok: true, postsUpdated: changed };
  });

  /** Move posts between topics (also used to split a topic into a new one). */
  app.post('/classes/:classId/topics/move', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const { posts, remove, add } = parse(moveTopicPostsSchema, req.body);
    for (const name of add) await ensureCatalogTopic(classId, name, 'lecturer', me.uid);
    const refs = posts.map((p) => C.posts(classId, p.sessionId).doc(p.postId));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let n = 0;
    snaps.forEach((s) => {
      if (!s.exists) return;
      const p = s.data() as PostDoc;
      if (!p.isRoot) return;
      const next = [...new Set([...(p.topics ?? []).filter((t) => t !== remove), ...add])].slice(0, 5);
      batch.update(s.ref, { topics: next, updatedAt: now() });
      n++;
    });
    if (!n) throw notFound('Không có bài đăng hợp lệ');
    await batch.commit();
    // keep replies in sync with their thread
    await syncReplyTopics(classId, posts);
    await audit(req, 'topic.move_posts', 'class', classId, { count: n, remove, add });
    return { ok: true, postsUpdated: n };
  });

  /** Lecturer decision on AI-suggested topics (AI suggestion is kept for comparison). */
  app.post('/classes/:classId/topic-reviews', async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const { items } = parse(topicReviewSchema, req.body);
    const snaps = await db.getAll(...items.map((i) => C.posts(classId, i.sessionId).doc(i.postId)));
    const batch = db.batch();
    const touched: { sessionId: string; postId: string }[] = [];
    snaps.forEach((s, i) => {
      if (!s.exists) return;
      const p = s.data() as PostDoc;
      const it = items[i]!;
      if (it.action === 'accept') {
        batch.update(s.ref, { topics: [...new Set([...(p.topics ?? []), ...(p.aiTopics ?? [])])].slice(0, 5), topicReview: 'accepted', updatedAt: now() });
      } else if (it.action === 'edit') {
        batch.update(s.ref, { topics: (it.topics ?? []).slice(0, 5), topicReview: 'edited', updatedAt: now() });
      } else {
        batch.update(s.ref, { topicReview: 'rejected', updatedAt: now() });
      }
      touched.push({ sessionId: it.sessionId, postId: it.postId });
    });
    await batch.commit();
    for (const it of items) if (it.action === 'edit') for (const t of it.topics ?? []) await ensureCatalogTopic(classId, t, 'lecturer', me.uid);
    await syncReplyTopics(classId, touched);
    await audit(req, 'topic.review', 'class', classId, { count: touched.length });
    return { ok: true, updated: touched.length };
  });

  /** Posts waiting for a topic decision. */
  app.get('/classes/:classId/topic-reviews', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await db.collectionGroup('posts').where('classId', '==', classId).where('topicReview', '==', 'pending').limit(300).get();
    const items = snap.docs.map((d) => d.data() as PostDoc).filter((p) => p.moderationStatus === 'visible');
    return serialize({ items });
  });
}

async function syncReplyTopics(classId: string, roots: { sessionId: string; postId: string }[]) {
  for (const r of roots) {
    const root = (await C.posts(classId, r.sessionId).doc(r.postId).get()).data() as PostDoc | undefined;
    if (!root) continue;
    const replies = await C.posts(classId, r.sessionId).where('rootPostId', '==', r.postId).get();
    if (replies.empty) continue;
    const batch = db.batch();
    replies.docs.forEach((d) => batch.update(d.ref, { topics: root.topics }));
    await batch.commit();
  }
}
