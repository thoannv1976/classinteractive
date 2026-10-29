import type { FastifyInstance } from 'fastify';
import { USER_ROLES } from '@classinteract/shared';
import { z } from 'zod';
import { config } from '../config';
import { db } from '../firebase';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/errors';
import { C } from '../lib/paths';
import { monthKey, serialize } from '../lib/time';

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/overview', { preHandler: requireAdmin }, async () => {
    const roleCounts = await Promise.all(USER_ROLES.map((r) => C.users().where('role', '==', r).count().get()));
    const [disabled, classes, activeClasses, liveSessions, pendingRoster, aiMonth] = await Promise.all([
      C.users().where('status', '==', 'disabled').count().get(),
      C.classes().where('tenantId', '==', config.tenantId).count().get(),
      C.classes().where('tenantId', '==', config.tenantId).where('status', '==', 'active').count().get(),
      db.collectionGroup('sessions').where('status', '==', 'open').count().get(),
      C.studentDirectory().where('uid', '==', null).count().get(),
      C.aiUsage().doc(`month_${monthKey()}`).get(),
    ]);
    return {
      users: Object.fromEntries(USER_ROLES.map((r, i) => [r, roleCounts[i]!.data().count])),
      disabledUsers: disabled.data().count,
      classes: classes.data().count,
      activeClasses: activeClasses.data().count,
      liveSessions: liveSessions.data().count,
      unregisteredStudents: pendingRoster.data().count,
      aiThisMonth: { costUsd: aiMonth.data()?.costUsd ?? 0, runs: aiMonth.data()?.runs ?? 0 },
    };
  });

  app.get('/admin/audit-logs', { preHandler: requireAdmin }, async (req) => {
    const q = parse(
      z.object({
        action: z.string().max(60).optional(),
        actorId: z.string().max(128).optional(),
        targetId: z.string().max(128).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        cursor: z.string().max(64).optional(),
      }),
      req.query,
    );
    let query: FirebaseFirestore.Query = C.auditLogs();
    if (q.action) query = query.where('action', '==', q.action);
    if (q.actorId) query = query.where('actorId', '==', q.actorId);
    if (q.targetId) query = query.where('targetId', '==', q.targetId);
    query = query.orderBy('createdAt', 'desc');
    if (q.cursor) {
      const cur = await C.auditLogs().doc(q.cursor).get();
      if (cur.exists) query = query.startAfter(cur);
    }
    const snap = await query.limit(q.limit + 1).get();
    const items = snap.docs.slice(0, q.limit).map((d) => d.data());
    return { items: serialize(items), nextCursor: snap.docs.length > q.limit ? items[items.length - 1]?.id : null };
  });

  app.get('/admin/ai-usage', { preHandler: requireAdmin }, async () => {
    const months = await C.aiUsage().where('month', '>=', '2000-01').orderBy('month', 'desc').limit(12).get();
    const runs = await C.aiRuns().orderBy('createdAt', 'desc').limit(50).get();
    return serialize({
      months: months.docs.map((d) => d.data()),
      recentRuns: runs.docs.map((d) => {
        const r = d.data();
        return {
          runId: r.runId,
          classId: r.classId,
          provider: r.provider,
          model: r.model,
          status: r.status,
          approvalStatus: r.approvalStatus,
          tokenUsage: r.tokenUsage,
          estimatedCost: r.estimatedCost,
          requestedByRole: r.requestedByRole,
          error: r.error,
          createdAt: r.createdAt,
        };
      }),
    });
  });
}
