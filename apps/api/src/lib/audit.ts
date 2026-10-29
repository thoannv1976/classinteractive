import type { FastifyRequest } from 'fastify';
import { config } from '../config';
import { now } from '../firebase';
import { C } from './paths';

/** Records administrative / security relevant actions. Never include passwords or secrets in details. */
export async function audit(
  req: FastifyRequest | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
  actorOverride?: { uid: string; displayName: string; role: string },
) {
  const actor = actorOverride ?? (req?.user ? { uid: req.user.uid, displayName: req.user.displayName, role: req.user.role } : null);
  const ref = C.auditLogs().doc();
  try {
    await ref.set({
      id: ref.id,
      tenantId: config.tenantId,
      actorId: actor?.uid ?? 'anonymous',
      actorName: actor?.displayName ?? '',
      actorRole: actor?.role ?? 'none',
      action,
      targetType,
      targetId,
      details,
      ip: req?.ip ?? null,
      createdAt: now(),
    });
  } catch (err) {
    req?.log.error({ err, action }, 'audit log write failed');
  }
}
