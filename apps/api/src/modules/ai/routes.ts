import type { FastifyInstance } from 'fastify';
import type { PostAuthorDoc } from '@classinteract/shared';
import { AI_PROVIDERS, aiAnswerSchema, aiSettingsSchema, apiKeySchema, publishAiRunSchema } from '@classinteract/shared';
import { z } from 'zod';
import { now } from '../../firebase';
import { assertClassWritable, loadClassAccess, requireClassModerator } from '../../lib/access';
import { audit } from '../../lib/audit';
import { currentUser, requireAdmin, requireRole } from '../../lib/auth';
import { keyStatuses, setProviderKey } from '../../lib/secrets';
import { getAdapter } from './providers';
import { conflict, forbidden, parse } from '../../lib/errors';
import { C } from '../../lib/paths';
import { serialize } from '../../lib/time';
import { notify } from '../notifications';
import { formatAnswer, getRun, providerStatus, publishAiReply, runAnswer } from './service';
import { getAiSettings } from './settings';

const aiLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export default async function aiRoutes(app: FastifyInstance) {
  /** Lecturer: AI drafts an answer for review. Student (student_support mode): AI answers own question directly. */
  app.post('/ai/answer', { config: aiLimit }, async (req) => {
    const me = currentUser(req);
    const input = parse(aiAnswerSchema, req.body);
    const a = await loadClassAccess(me, input.classId);
    assertClassWritable(a);
    let studentRequest = false;
    if (!a.canModerate) {
      if (a.cls.settings.aiMode !== 'student_support') throw forbidden('Chỉ giảng viên được dùng AI gợi ý trả lời trong lớp này');
      const author = (await C.postAuthor(input.classId, input.sessionId, input.postId).get()).data() as PostAuthorDoc | undefined;
      if (author?.authorUid !== me.uid) throw forbidden('Bạn chỉ được hỏi AI cho câu hỏi của mình');
      studentRequest = true;
    }
    const result = await runAnswer({ user: me, cls: a.cls, sessionId: input.sessionId, postId: input.postId, provider: a.canModerate ? input.provider : undefined, studentRequest });
    await audit(req, 'ai.answer', 'aiRun', result.runId, { classId: input.classId, provider: result.provider, studentRequest });
    return result;
  });

  app.post('/ai/runs/:runId/publish', async (req) => {
    const { runId } = req.params as { runId: string };
    const me = currentUser(req);
    const { content } = parse(publishAiRunSchema, req.body);
    const run = await getRun(runId);
    const a = await requireClassModerator(me, run.classId);
    if (run.status !== 'completed') throw conflict('Yêu cầu AI chưa hoàn tất');
    if (run.approvalStatus !== 'draft') throw conflict('Bản nháp đã được xử lý');
    const postId = await publishAiReply({ cls: a.cls, sessionId: run.sessionId, postId: run.postId, runId, content, approvedBy: me.uid });
    await C.aiRuns().doc(runId).update({ approvalStatus: 'published', publishedPostId: postId, approvedBy: me.uid, approvedAt: now() });
    const author = (await C.postAuthor(run.classId, run.sessionId, run.postId).get()).data() as PostAuthorDoc | undefined;
    if (author?.authorUid) {
      await notify([author.authorUid], {
        type: 'ai_answer',
        title: 'Câu hỏi của bạn có câu trả lời (AI, đã được giảng viên duyệt)',
        body: content.slice(0, 140),
        link: `/classes/${run.classId}/sessions/${run.sessionId}/posts/${run.postId}`,
      });
    }
    await audit(req, 'ai.publish', 'aiRun', runId, { classId: run.classId, edited: run.output ? content !== formatAnswer(run.output) : true });
    return { postId };
  });

  app.post('/ai/runs/:runId/reject', async (req) => {
    const { runId } = req.params as { runId: string };
    const me = currentUser(req);
    const run = await getRun(runId);
    await requireClassModerator(me, run.classId);
    if (run.approvalStatus !== 'draft') throw conflict('Bản nháp đã được xử lý');
    await C.aiRuns().doc(runId).update({ approvalStatus: 'rejected', approvedBy: me.uid, approvedAt: now() });
    await audit(req, 'ai.reject', 'aiRun', runId, { classId: run.classId });
    return { ok: true };
  });

  app.get('/ai/runs', async (req) => {
    const me = currentUser(req);
    const q = parse(z.object({ classId: z.string().min(1).max(64), postId: z.string().max(64).optional() }), req.query);
    await requireClassModerator(me, q.classId);
    let query = C.aiRuns().where('classId', '==', q.classId);
    if (q.postId) query = query.where('postId', '==', q.postId);
    const snap = await query.orderBy('createdAt', 'desc').limit(q.postId ? 20 : 100).get();
    return { items: serialize(snap.docs.map((d) => d.data())) };
  });

  app.get('/ai/status', async () => {
    const s = await getAiSettings();
    const providers = await providerStatus();
    return { enabled: s.enabled, defaultProvider: s.defaultProvider, providers: providers.map((p) => ({ ...p, enabled: s.providers[p.provider].enabled, model: s.providers[p.provider].model })) };
  });

  app.get('/admin/settings/ai', { preHandler: requireAdmin }, async () => {
    return { settings: serialize(await getAiSettings()), providers: await providerStatus(), keys: serialize(await keyStatuses()) };
  });

  /** Store / replace / remove an AI provider API key (super administrator only). The key is never returned. */
  app.put('/admin/settings/ai/keys/:provider', { preHandler: requireRole('superadmin'), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(AI_PROVIDERS) }), req.params);
    const { apiKey } = parse(apiKeySchema, req.body);
    await setProviderKey(provider, apiKey, currentUser(req).uid);
    await audit(req, apiKey ? 'settings.ai_key_set' : 'settings.ai_key_remove', 'settings', provider, { last4: apiKey ? apiKey.slice(-4) : null });
    return { ok: true, keys: serialize(await keyStatuses()) };
  });

  /** Sends a tiny request with the stored key and the configured model. */
  app.post('/admin/settings/ai/keys/:provider/test', { preHandler: requireAdmin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(AI_PROVIDERS) }), req.params);
    const settings = await getAiSettings();
    const started = Date.now();
    try {
      const r = await getAdapter(provider).generateStructured({
        model: settings.providers[provider].model,
        system: 'Health check. Reply with the JSON object only.',
        user: 'Return {"ok": true}.',
        schemaName: 'health_check',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
        maxOutputTokens: 200,
        timeoutMs: 30000,
      });
      return { ok: true, model: r.model, latencyMs: Date.now() - started };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, error: (e as Error).message.slice(0, 300) };
    }
  });

  app.put('/admin/settings/ai', { preHandler: requireAdmin }, async (req) => {
    const me = currentUser(req);
    const input = parse(aiSettingsSchema, req.body);
    await C.settings('ai').set({ ...input, updatedAt: now(), updatedBy: me.uid });
    await audit(req, 'settings.ai_update', 'settings', 'ai', { defaultProvider: input.defaultProvider, enabled: input.enabled });
    return { ok: true };
  });
}
