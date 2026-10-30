import type { FastifyInstance } from 'fastify';
import type { AiJobDoc, ClusterDoc, PostAuthorDoc, PostDoc, SessionSummaryDoc } from '@classinteract/shared';
import {
  mergeClustersSchema,
  moveClusterItemSchema,
  startJobSchema,
  updateClusterSchema,
  updateSummarySchema,
} from '@classinteract/shared';
import { z } from 'zod';
import { db, now } from '../../firebase';
import { loadClassAccess, requireClassModerator } from '../../lib/access';
import { audit } from '../../lib/audit';
import { currentUser } from '../../lib/auth';
import { AppError, badRequest, notFound, parse } from '../../lib/errors';
import { createJob } from '../../lib/jobs';
import { requestLang } from '../../lib/lang';
import { C } from '../../lib/paths';
import { serialize } from '../../lib/time';
import { providerOrder } from './executor';
import { clusterStats, embeddingConfig, embeddingsFor } from './jobs';
import { cosine, embedTexts } from './providers';

const clustersCol = (classId: string) => C.class(classId).collection('clusters');

async function assertAiReady(cls: Parameters<typeof providerOrder>[0]) {
  if (!cls.settings.aiEnabled) throw new AppError(403, 'AI_DISABLED', 'Lớp này chưa bật chức năng AI');
  const { settings, order } = await providerOrder(cls, 'summarize');
  if (!settings.enabled) throw new AppError(503, 'AI_DISABLED', 'Chức năng AI đang tắt trên toàn hệ thống');
  if (!order.length) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Chưa cấu hình nhà cung cấp AI nào (thiếu API key)');
}

async function reloadClusterStats(classId: string, c: ClusterDoc) {
  const snaps = c.items.length ? await db.getAll(...c.items.map((i) => C.posts(classId, i.sessionId).doc(i.postId))) : [];
  const posts = snaps.filter((s) => s.exists).map((s) => s.data() as PostDoc);
  const authors = posts.length ? await db.getAll(...posts.map((p) => C.postAuthor(classId, p.sessionId, p.postId))) : [];
  const authorOf = new Map(authors.filter((a) => a.exists).map((a) => [(a.data() as PostAuthorDoc).postId, (a.data() as PostAuthorDoc).authorUid]));
  return clusterStats(posts, authorOf);
}

export default async function insightRoutes(app: FastifyInstance) {
  // ---------- jobs
  app.post('/classes/:classId/ai-jobs', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { classId } = req.params as { classId: string };
    const me = currentUser(req);
    const a = await requireClassModerator(me, classId);
    const input = parse(startJobSchema, req.body);
    await assertAiReady(a.cls);
    if ((input.type === 'summarize_session' || input.type === 'summarize_activity') && !input.sessionId) throw badRequest('Thiếu buổi học');
    if (input.type === 'summarize_activity' && !input.activityId) throw badRequest('Thiếu hoạt động');
    if (input.sessionId && !(await C.session(classId, input.sessionId).get()).exists) throw notFound('Không tìm thấy buổi học');
    const sessionId = input.type === 'teaching_insights' ? null : (input.sessionId ?? null);
    const job = await createJob({
      cls: a.cls,
      user: me,
      type: input.type,
      sessionId,
      params: { ...(input.activityId ? { activityId: input.activityId } : {}), ...(input.force ? { force: true } : {}) },
      lang: requestLang(req),
    });
    await audit(req, 'ai.job', 'class', classId, { type: input.type, sessionId });
    return serialize(job);
  });

  app.get('/classes/:classId/ai-jobs', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await C.class(classId).collection('aiJobs').orderBy('createdAt', 'desc').limit(30).get();
    return { items: serialize(snap.docs.map((d) => d.data() as AiJobDoc)) };
  });

  // ---------- session summary
  app.get('/classes/:classId/sessions/:sessionId/summary', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    const a = await loadClassAccess(currentUser(req), classId);
    const snap = await C.session(classId, sessionId).collection('summary').doc('current').get();
    const doc = snap.data() as SessionSummaryDoc | undefined;
    if (!doc || (!a.canModerate && !doc.published)) return { summary: null };
    return serialize({ summary: doc });
  });

  app.put('/classes/:classId/sessions/:sessionId/summary', async (req) => {
    const { classId, sessionId } = req.params as { classId: string; sessionId: string };
    const me = currentUser(req);
    await requireClassModerator(me, classId);
    const input = parse(updateSummarySchema, req.body);
    const ref = C.session(classId, sessionId).collection('summary').doc('current');
    const snap = await ref.get();
    if (!snap.exists) throw notFound('Chưa có bản tóm tắt');
    const cur = snap.data() as SessionSummaryDoc;
    const update: Record<string, unknown> = { updatedAt: now() };
    if (input.sections) Object.assign(update, { sections: input.sections, editedBy: me.uid, status: 'draft' });
    if (input.status === 'approved') Object.assign(update, { status: 'approved', approvedBy: me.uid, approvedAt: now() });
    if (input.status === 'draft') Object.assign(update, { status: 'draft', published: false });
    if (input.published !== undefined) {
      const willBeApproved = input.status === 'approved' || (cur.status === 'approved' && !input.sections);
      if (input.published && !willBeApproved) throw badRequest('Hãy duyệt bản tóm tắt trước khi công bố');
      update.published = input.published;
    }
    if (input.sections && cur.published) update.published = false; // edited text must be re-approved
    await ref.update(update);
    await audit(req, 'summary.update', 'session', sessionId, { classId, status: input.status, published: input.published });
    return { ok: true };
  });

  // ---------- question clusters
  app.get('/classes/:classId/clusters', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const q = parse(z.object({ scope: z.enum(['session', 'class']).default('class'), sessionId: z.string().max(64).optional() }), req.query);
    const snap = await clustersCol(classId).where('scope', '==', q.scope).get();
    const clusters = snap.docs
      .map((d) => d.data() as ClusterDoc)
      .filter((c) => q.scope === 'class' || c.sessionId === q.sessionId)
      .sort((a, b) => b.interest - a.interest);
    const refs = clusters.flatMap((c) => c.items);
    const snaps = refs.length ? await db.getAll(...refs.map((r) => C.posts(classId, r.sessionId).doc(r.postId))) : [];
    const posts = Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
    return serialize({ clusters, posts });
  });

  app.patch('/classes/:classId/clusters/:clusterId', async (req) => {
    const { classId, clusterId } = req.params as { classId: string; clusterId: string };
    await requireClassModerator(currentUser(req), classId);
    const input = parse(updateClusterSchema, req.body);
    const ref = clustersCol(classId).doc(clusterId);
    if (!(await ref.get()).exists) throw notFound();
    await ref.update({ ...input, locked: true, updatedAt: now() });
    return { ok: true };
  });

  app.delete('/classes/:classId/clusters/:clusterId', async (req) => {
    const { classId, clusterId } = req.params as { classId: string; clusterId: string };
    await requireClassModerator(currentUser(req), classId);
    await clustersCol(classId).doc(clusterId).delete();
    return { ok: true };
  });

  app.post('/classes/:classId/clusters/merge', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const { ids, name } = parse(mergeClustersSchema, req.body);
    const snaps = await db.getAll(...ids.map((id) => clustersCol(classId).doc(id)));
    const list = snaps.filter((s) => s.exists).map((s) => s.data() as ClusterDoc);
    if (list.length < 2) throw badRequest('Chọn ít nhất hai nhóm');
    const target = list[0]!;
    const seen = new Set<string>();
    const items = list.flatMap((c) => c.items).filter((i) => !seen.has(i.postId) && (seen.add(i.postId), true));
    const merged = { ...target, items, name: name ?? target.name, scope: list.every((c) => c.scope === 'session' && c.sessionId === target.sessionId) ? target.scope : 'class', sessionId: list.every((c) => c.sessionId === target.sessionId) ? target.sessionId : null };
    const stats = await reloadClusterStatsSafe(classId, merged as ClusterDoc);
    const batch = db.batch();
    batch.set(clustersCol(classId).doc(target.clusterId), { ...merged, ...stats, locked: true, method: 'manual', updatedAt: now() });
    list.slice(1).forEach((c) => batch.delete(clustersCol(classId).doc(c.clusterId)));
    await batch.commit();
    return { clusterId: target.clusterId };
  });

  /** Move one question to another cluster (or out of every cluster with toClusterId = null). */
  app.post('/classes/:classId/clusters/move', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const { item, toClusterId, fromClusterId } = parse(moveClusterItemSchema, req.body);
    let all = (await clustersCol(classId).get()).docs.map((d) => d.data() as ClusterDoc);
    // Session groups and whole-class groups are independent views: only touch the same view.
    const target = all.find((c) => c.clusterId === toClusterId);
    const source = all.find((c) => c.clusterId === fromClusterId);
    const view = source ?? target;
    if (fromClusterId) all = all.filter((c) => c.clusterId === fromClusterId || c.clusterId === toClusterId);
    else if (view) all = all.filter((c) => c.scope === view.scope && (c.sessionId ?? null) === (view.sessionId ?? null));
    const batch = db.batch();
    for (const c of all) {
      const has = c.items.some((i) => i.postId === item.postId);
      if (c.clusterId === toClusterId && !has) {
        const next = { ...c, items: [...c.items, item] };
        batch.set(clustersCol(classId).doc(c.clusterId), { ...next, ...(await reloadClusterStatsSafe(classId, next)), locked: true, updatedAt: now() });
      } else if (has && c.clusterId !== toClusterId) {
        const next = { ...c, items: c.items.filter((i) => i.postId !== item.postId) };
        if (next.items.length === 0) batch.delete(clustersCol(classId).doc(c.clusterId));
        else batch.set(clustersCol(classId).doc(c.clusterId), { ...next, ...(await reloadClusterStatsSafe(classId, next)), locked: true, updatedAt: now() });
      }
    }
    await batch.commit();
    return { ok: true };
  });

  // ---------- teaching insights & activity summaries
  app.get('/classes/:classId/insights', async (req) => {
    const { classId } = req.params as { classId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await C.class(classId).collection('insights').doc('latest').get();
    return serialize({ insights: snap.data() ?? null });
  });

  app.get('/classes/:classId/sessions/:sessionId/activities/:activityId/ai-summary', async (req) => {
    const { classId, sessionId, activityId } = req.params as { classId: string; sessionId: string; activityId: string };
    await requireClassModerator(currentUser(req), classId);
    const snap = await C.activities(classId, sessionId).doc(activityId).collection('staff').doc('aiSummary').get();
    return serialize({ summary: snap.data() ?? null });
  });

  // ---------- semantic duplicate detection while typing
  const cache = new Map<string, { at: number; posts: PostDoc[]; vectors: Map<string, number[]> }>();
  app.post('/classes/:classId/similar-questions', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { classId } = req.params as { classId: string };
    const a = await loadClassAccess(currentUser(req), classId);
    const { text, sessionId } = parse(z.object({ text: z.string().trim().min(10).max(2000), sessionId: z.string().max(64).optional() }), req.body);
    if (!a.cls.settings.aiEnabled) return { method: 'none', items: [] };
    const cfg = await embeddingConfig();
    if (!cfg) return { method: 'none', items: [] };
    const key = `${classId}:${sessionId ?? '*'}`;
    let entry = cache.get(key);
    if (!entry || Date.now() - entry.at > 60_000) {
      const base = sessionId ? C.posts(classId, sessionId) : null;
      const snap = base
        ? await base.where('isRoot', '==', true).where('type', '==', 'question').limit(300).get()
        : await db.collectionGroup('posts').where('classId', '==', classId).where('type', '==', 'question').limit(500).get();
      const posts = snap.docs.map((d) => d.data() as PostDoc).filter((p) => p.moderationStatus === 'visible');
      entry = { at: Date.now(), posts, vectors: await embeddingsFor(classId, posts, cfg) };
      cache.set(key, entry);
    }
    const [v] = await embedTexts(cfg.provider, cfg.model, [text]);
    if (!v) return { method: 'embedding', items: [] };
    const items = entry.posts
      .map((p) => ({ p, sim: cosine(v, entry!.vectors.get(p.postId) ?? []) }))
      .filter((x) => x.sim >= cfg.threshold)
      .sort((x, y) => y.sim - x.sim)
      .slice(0, 3)
      .map((x) => ({ postId: x.p.postId, sessionId: x.p.sessionId, content: x.p.content, voteCount: x.p.voteCount, status: x.p.status, similarity: Math.round(x.sim * 100) / 100 }));
    return { method: 'embedding', items };
  });

}

async function reloadClusterStatsSafe(classId: string, c: ClusterDoc) {
  try {
    return await reloadClusterStats(classId, c);
  } catch {
    return {};
  }
}
