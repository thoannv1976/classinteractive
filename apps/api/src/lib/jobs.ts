import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';
import type { AiJobDoc, AiJobType, ClassDoc, Lang, UserDoc } from '@classinteract/shared';
import { config } from '../config';
import { db, now } from '../firebase';
import { AppError, notFound } from './errors';

/**
 * Background AI jobs. Long tasks (summaries, clustering, classification of a whole class) would
 * exceed the 60 s Hosting request limit, so they run as jobs:
 *  - production: a Cloud Tasks HTTP task calls POST {SERVICE_URL}/internal/jobs/:classId/:jobId
 *    with an OIDC token of the service account (verified below);
 *  - development / emulator / not configured: run in-process right after the response.
 * Job documents live in classes/{classId}/aiJobs so class staff can follow progress in realtime.
 */
export const jobRef = (classId: string, jobId: string) => db.collection('classes').doc(classId).collection('aiJobs').doc(jobId);

type Handler = (job: AiJobDoc, progress: (text: string) => Promise<void>) => Promise<Record<string, unknown>>;
const handlers = new Map<AiJobType, Handler>();
export const registerJobHandler = (type: AiJobType, h: Handler) => handlers.set(type, h);

const tasksConfigured = () => !!(process.env.TASKS_QUEUE && process.env.SERVICE_URL && process.env.TASKS_SA_EMAIL) && !config.isEmulator;
let tasks: CloudTasksClient | null = null;

export async function createJob(input: {
  cls: ClassDoc;
  user: UserDoc;
  type: AiJobType;
  sessionId?: string | null;
  params?: Record<string, unknown>;
  lang: Lang;
}) {
  const ref = db.collection('classes').doc(input.cls.classId).collection('aiJobs').doc();
  // One running job of a given type per target at a time
  const running = await db
    .collection('classes')
    .doc(input.cls.classId)
    .collection('aiJobs')
    .where('type', '==', input.type)
    .where('status', 'in', ['queued', 'running'])
    .get();
  const sameTarget = running.docs.find((d) => (d.data().sessionId ?? null) === (input.sessionId ?? null) && JSON.stringify(d.data().params ?? {}) === JSON.stringify(input.params ?? {}));
  if (sameTarget) return sameTarget.data() as AiJobDoc;

  const job: AiJobDoc = {
    jobId: ref.id,
    tenantId: input.cls.tenantId,
    classId: input.cls.classId,
    sessionId: input.sessionId ?? null,
    type: input.type,
    status: 'queued',
    params: input.params ?? {},
    lang: input.lang,
    requestedBy: input.user.uid,
    requestedByName: input.user.displayName,
    progress: null,
    result: null,
    error: null,
    attempts: 0,
    createdAt: now() as never,
    startedAt: null,
    completedAt: null,
  };
  await ref.set(job);
  if (tasksConfigured()) {
    tasks ??= new CloudTasksClient();
    await tasks.createTask({
      parent: process.env.TASKS_QUEUE!,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${process.env.SERVICE_URL}/internal/jobs/${input.cls.classId}/${ref.id}`,
          oidcToken: { serviceAccountEmail: process.env.TASKS_SA_EMAIL!, audience: process.env.SERVICE_URL! },
        },
        dispatchDeadline: { seconds: 600 },
      },
    });
  } else {
    setImmediate(() => void runJob(input.cls.classId, ref.id).catch(() => undefined));
  }
  return { ...job, createdAt: new Date().toISOString() } as unknown as AiJobDoc;
}

/** Executes a job (idempotent: completed jobs are skipped). */
export async function runJob(classId: string, jobId: string) {
  const ref = jobRef(classId, jobId);
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Không tìm thấy tác vụ');
    const j = snap.data() as AiJobDoc;
    if (j.status === 'completed') return null;
    tx.update(ref, { status: 'running', startedAt: now(), attempts: (j.attempts ?? 0) + 1, error: null });
    return j;
  });
  if (!job) return;
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new AppError(500, 'NO_HANDLER', `No handler for ${job.type}`);
    const result = await handler(job, async (text) => {
      await ref.update({ progress: text }).catch(() => undefined);
    });
    await ref.update({ status: 'completed', result, progress: null, completedAt: now() });
  } catch (e) {
    const msg = e instanceof AppError ? e.message : (e as Error).message;
    await ref.update({ status: 'failed', error: msg.slice(0, 1000), progress: null, completedAt: now() });
  }
}

const oauth = new OAuth2Client();
/** Verifies that the request comes from Cloud Tasks with our service account. */
export async function verifyTaskRequest(authorization: string | undefined) {
  if (!tasksConfigured()) return false;
  const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
  if (!token) return false;
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: process.env.SERVICE_URL! });
    const p = ticket.getPayload();
    return !!p && p.email === process.env.TASKS_SA_EMAIL && p.email_verified === true;
  } catch {
    return false;
  }
}
