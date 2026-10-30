import type { FastifyInstance } from 'fastify';
import type { NotificationType, Params } from '@classinteract/shared';
import { interpolate } from '@classinteract/shared';
import { z } from 'zod';
import { db, now } from '../firebase';
import { currentUser } from '../lib/auth';
import { parse } from '../lib/errors';
import { C } from '../lib/paths';

/**
 * Best-effort in-app notifications (never blocks the main action).
 * `title` is always a Vietnamese template (translated on the client). `body` is a template when
 * `bodyParams` is given or `bodyTranslatable` is set; otherwise it is user content shown as is.
 */
export async function notify(
  uids: string[],
  input: {
    type: NotificationType;
    title: string;
    titleParams?: Params;
    body: string;
    bodyParams?: Params;
    bodyTranslatable?: boolean;
    link: string | null;
  },
) {
  const translatableBody = input.bodyTranslatable || !!input.bodyParams;
  const n = {
    type: input.type,
    title: interpolate(input.title, input.titleParams),
    titleKey: input.title,
    titleParams: input.titleParams ?? null,
    body: interpolate(input.body, input.bodyParams),
    bodyKey: translatableBody ? input.body : null,
    bodyParams: input.bodyParams ?? null,
    link: input.link,
  };
  const unique = [...new Set(uids)].filter(Boolean);
  try {
    for (let i = 0; i < unique.length; i += 400) {
      const batch = db.batch();
      for (const uid of unique.slice(i, i + 400)) {
        const ref = C.notifications(uid).doc();
        batch.set(ref, { id: ref.id, ...n, read: false, createdAt: now() });
      }
      await batch.commit();
    }
  } catch {
    // ignore – notifications are not critical
  }
}

export default async function notificationRoutes(app: FastifyInstance) {
  app.post('/notifications/read', async (req) => {
    const me = currentUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.string().max(64)).max(200).optional() }), req.body);
    let refs;
    if (ids?.length) refs = ids.map((id) => C.notifications(me.uid).doc(id));
    else refs = (await C.notifications(me.uid).where('read', '==', false).limit(400).get()).docs.map((d) => d.ref);
    const batch = db.batch();
    refs.forEach((r) => batch.set(r, { read: true }, { merge: true }));
    if (refs.length) await batch.commit();
    return { updated: refs.length };
  });
}
