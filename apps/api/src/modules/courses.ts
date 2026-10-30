import type { FastifyInstance } from 'fastify';
import { courseSchema, isAdminRole } from '@classinteract/shared';
import { config } from '../config';
import { now } from '../firebase';
import { audit } from '../lib/audit';
import { currentUser, requireStaff } from '../lib/auth';
import { conflict, forbidden, notFound, parse } from '../lib/errors';
import { C } from '../lib/paths';
import { serialize } from '../lib/time';

export default async function courseRoutes(app: FastifyInstance) {
  app.get('/courses', { preHandler: requireStaff }, async () => {
    const snap = await C.courses().where('tenantId', '==', config.tenantId).orderBy('code').get();
    return { items: serialize(snap.docs.map((d) => d.data())) };
  });

  app.post('/courses', { preHandler: requireStaff }, async (req) => {
    const input = parse(courseSchema, req.body);
    const me = currentUser(req);
    const dup = await C.courses().where('tenantId', '==', config.tenantId).where('code', '==', input.code).limit(1).get();
    if (!dup.empty) throw conflict('Mã học phần {{code}} đã tồn tại', 'CONFLICT', { code: input.code });
    const ref = C.courses().doc();
    await ref.set({ ...input, courseId: ref.id, tenantId: config.tenantId, createdBy: me.uid, createdAt: now(), updatedAt: now() });
    await audit(req, 'course.create', 'course', ref.id, { code: input.code });
    return { courseId: ref.id };
  });

  app.patch('/courses/:id', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    const me = currentUser(req);
    const snap = await C.courses().doc(id).get();
    if (!snap.exists) throw notFound();
    if (!isAdminRole(me.role) && snap.data()!.createdBy !== me.uid) throw forbidden();
    const input = parse(courseSchema.partial(), req.body);
    await snap.ref.update({ ...input, updatedAt: now() });
    await audit(req, 'course.update', 'course', id, input);
    return { ok: true };
  });
}
