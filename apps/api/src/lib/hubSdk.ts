/**
 * UniGame Hub SDK (copy of unigame-hub/sdk, server side): launch ticket verification and
 * class-wide grade submission. Keep in sync with https://github.com/thoannv1976/unigamehub.
 */
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';

export const TICKET_TYP = 'unigamehub-launch+jwt';

export interface LaunchContext {
  ticketId: string;
  /** Stable pseudonymous id of this LMS user inside the Hub (tenant + issuer + LTI sub). */
  hubUserId: string;
  tenantId: string;
  gameId: string;
  platform: { issuer: string; deploymentId: string };
  ltiSub: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  /** LMS login name (Moodle username), when the LMS shares names. */
  username?: string;
  role: 'instructor' | 'learner';
  context?: { id: string; title?: string; label?: string };
  resourceLink: { id: string; title?: string };
  /** Game-specific activity id chosen by the instructor (mission, case, exam session...). */
  activity?: string;
  /** Present when this activity sends grades to the LMS. Store it with the attempt. */
  gradeTarget?: string;
  /** Present when the activity has a gradebook column: send grades for the whole class (submitBulkResult). */
  linkTarget?: string;
  launchId: string;
  returnUrl?: string;
  locale?: string;
}

export interface VerifyOptions {
  /** Hub base URL, e.g. https://gamehub-xxxx.a.run.app (ticket issuer). */
  hubUrl: string;
  gameId: string;
  /** Optional key resolver; defaults to the Hub's /lti/jwks. */
  jwks?: JWTVerifyGetKey;
  /**
   * Replay protection: called once per ticket. Return false if the jti was already used.
   * Implement with an atomic create (e.g. Firestore doc.create(jti)).
   */
  markUsed?: (jti: string, expiresAt: Date) => Promise<boolean>;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

export async function verifyLaunchTicket(ticket: string, opts: VerifyOptions): Promise<LaunchContext> {
  const hubUrl = opts.hubUrl.replace(/\/+$/, '');
  let jwks = opts.jwks ?? jwksCache.get(hubUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${hubUrl}/lti/jwks`));
    jwksCache.set(hubUrl, jwks);
  }
  const { payload, protectedHeader } = await jwtVerify(ticket, jwks, {
    issuer: hubUrl,
    audience: opts.gameId,
    algorithms: ['RS256'],
    typ: TICKET_TYP,
    maxTokenAge: '5m',
  });
  if (protectedHeader.typ !== TICKET_TYP) throw new Error('Wrong token type');
  if (!payload.jti || !payload.sub || !payload.exp) throw new Error('Ticket missing jti/sub/exp');
  if (opts.markUsed && !(await opts.markUsed(payload.jti, new Date(payload.exp * 1000)))) {
    throw new Error('Ticket already used');
  }
  const c = payload.ugh as Omit<LaunchContext, 'ticketId' | 'hubUserId' | 'gameId'>;
  return { ...c, ticketId: payload.jti, hubUserId: payload.sub, gameId: opts.gameId };
}

export interface SubmitOptions {
  hubUrl: string;
  gameId: string;
  /** Shared secret from the Hub (GAME_SECRET_<ID>). Keep it in Secret Manager. */
  secret: string;
  fetch?: typeof fetch;
}

export interface BulkRow {
  /** LaunchContext.hubUserId when the student has opened the activity from the LMS (most reliable). */
  hubUserId?: string;
  /** LMS username (e.g. Moodle username = student code). */
  username?: string;
  email?: string;
  score: number;
  comment?: string;
}

export interface BulkInput {
  /** From LaunchContext.linkTarget. */
  linkTarget: string;
  /** Idempotency key of this batch (e.g. a confirmed score snapshot id). Re-sending the same batch is a no-op. */
  batchId: string;
  maxScore: number;
  /** When the scores were decided (e.g. the snapshot's confirmedAt). Keep it stable so re-sending a batch is a no-op;
   *  older batches never overwrite newer ones. Default: now. */
  occurredAt?: string;
  rows: BulkRow[];
}

export interface BulkResponse {
  status: 'accepted';
  matched: number;
  queued: number;
  duplicate: number;
  stale_ignored: number;
  not_better: number;
  unmatched: Array<{ hub_user_id?: string; username?: string; email?: string }>;
}

export async function createBulkResultToken(opts: SubmitOptions, b: BulkInput): Promise<string> {
  const hubUrl = opts.hubUrl.replace(/\/+$/, '');
  return new SignJWT({
    bulk: {
      link_target: b.linkTarget,
      batch_id: b.batchId,
      max_score: b.maxScore,
      occurred_at: b.occurredAt ?? new Date().toISOString(),
      rows: b.rows.map((r) => ({
        ...(r.hubUserId ? { hub_user_id: r.hubUserId } : {}),
        ...(r.username ? { username: r.username } : {}),
        ...(r.email ? { email: r.email } : {}),
        score: r.score,
        ...(r.comment ? { comment: r.comment } : {}),
      })),
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'unigamehub-result+jwt' })
    .setIssuer(opts.gameId)
    .setAudience(hubUrl)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(opts.secret));
}

/** Sends grades for a whole class. The Hub finds students in the LMS course (NRPS) and queues delivery. */
export async function submitBulkResult(opts: SubmitOptions, b: BulkInput): Promise<BulkResponse> {
  const token = await createBulkResultToken(opts, b);
  const res = await (opts.fetch ?? fetch)(`${opts.hubUrl.replace(/\/+$/, '')}/api/v1/results/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ result_token: token }),
  });
  const body = (await res.json().catch(() => ({}))) as BulkResponse & { error?: string; message?: string };
  if (!res.ok) throw new Error(`Hub rejected bulk result (${res.status}): ${body.message ?? body.error ?? 'unknown'}`);
  return body;
}

