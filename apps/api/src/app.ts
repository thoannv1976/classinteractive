import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { config } from './config';
import { translate } from '@classinteract/shared';
import { authenticate } from './lib/auth';
import { requestLang } from './lib/lang';
import { errorHandler } from './lib/errors';
import activityRoutes from './modules/activities';
import adminRoutes from './modules/admin';
import aiRoutes from './modules/ai/routes';
import analyticsRoutes from './modules/analytics';
import authRoutes from './modules/auth';
import classRoutes from './modules/classes';
import courseRoutes from './modules/courses';
import exportRoutes from './modules/exports';
import notificationRoutes from './modules/notifications';
import postRoutes from './modules/posts';
import sessionRoutes from './modules/sessions';
import setupRoutes from './modules/setup';
import userRoutes from './modules/users';

export async function buildApp() {
  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            // Cloud Logging understands "severity"; never log request bodies (passwords).
            formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
            redact: ['req.headers.authorization', 'req.headers["x-setup-token"]'],
          },
    trustProxy: true,
    bodyLimit: 4 * 1024 * 1024,
  });

  app.setErrorHandler(errorHandler);
  await app.register(helmet, { contentSecurityPolicy: false });
  if (config.corsOrigins.length) await app.register(cors, { origin: config.corsOrigins, credentials: false });
  // Signed-in requests are limited per user (token), not per IP: a whole class often shares one
  // campus NAT address. Anonymous requests (login/register) fall back to the client IP.
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const h = req.headers.authorization;
      return h ? 'u:' + createHash('sha256').update(h).digest('base64url').slice(0, 24) : 'ip:' + req.ip;
    },
  });

  app.get('/healthz', async () => ({ ok: true }));

  await app.register(
    async (api) => {
      // Public routes
      await api.register(setupRoutes);
      await api.register(authRoutes);
      // Everything else requires a valid, active account
      await api.register(async (priv) => {
        priv.addHook('preHandler', authenticate);
        await priv.register(userRoutes);
        await priv.register(courseRoutes);
        await priv.register(classRoutes);
        await priv.register(sessionRoutes);
        await priv.register(postRoutes);
        await priv.register(activityRoutes);
        await priv.register(analyticsRoutes);
        await priv.register(exportRoutes);
        await priv.register(aiRoutes);
        await priv.register(notificationRoutes);
        await priv.register(adminRoutes);
      });
    },
    { prefix: '/api/v1' },
  );

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: translate(requestLang(req), 'Endpoint không tồn tại') } }),
  );
  return app;
}
