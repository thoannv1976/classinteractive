import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { bootstrapSchema } from '@classinteract/shared';
import { config } from '../config';
import { createStaffAccount } from '../lib/accounts';
import { audit } from '../lib/audit';
import { AppError, conflict, forbidden, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { ensureAiSettings } from './ai/settings';

async function isInitialized() {
  const q = await C.users().where('role', '==', 'superadmin').limit(1).get();
  return !q.empty;
}

function tokenMatches(given: string) {
  const expected = Buffer.from(config.setupToken);
  const actual = Buffer.from(given);
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export default async function setupRoutes(app: FastifyInstance) {
  app.get('/setup/status', async () => ({ initialized: await isInitialized() }));

  /** Creates the first super admin. Requires SETUP_TOKEN and only works once. */
  app.post('/setup/bootstrap', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    if (!config.setupToken) throw new AppError(503, 'SETUP_DISABLED', 'SETUP_TOKEN chưa được cấu hình');
    const given = String(req.headers['x-setup-token'] ?? '');
    if (!tokenMatches(given)) throw forbidden('Setup token không đúng');
    if (await isInitialized()) throw conflict('Hệ thống đã được khởi tạo', 'ALREADY_INITIALIZED');
    const input = parse(bootstrapSchema, req.body);
    const uid = await createStaffAccount({ ...input, role: 'superadmin' });
    await ensureAiSettings();
    await audit(req, 'setup.bootstrap', 'user', uid, { email: input.email }, { uid, displayName: input.displayName, role: 'superadmin' });
    return { uid };
  });
}
