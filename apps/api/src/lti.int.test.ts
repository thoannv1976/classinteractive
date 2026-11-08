import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TICKET_TYP } from './lib/hubSdk';
import { Client, idTokenFor, rid, setup } from './test/helpers';

/**
 * UniGame Hub adapter. A fake Hub (local HTTP server) publishes the ticket signing key and receives
 * class-wide grade batches (see vitest.int.config.ts: LTI_* env).
 */
const HUB = 'http://127.0.0.1:18799';
const ISS = 'https://moodle.test';
const SECRET = 'test-hub-secret-0123456789';

let ctx: Awaited<ReturnType<typeof setup>>;
let admin: Client, lec: Client;
let classId = '';
let hub: Server;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwk: JWK;
const bulkCalls: Array<Record<string, any>> = [];

async function ticket(over: { sub: string; role: 'instructor' | 'learner'; name: string; email?: string; username?: string; tenantId?: string; contextId?: string; linkTarget?: string }) {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({
    ugh: {
      tenantId: over.tenantId ?? 'hub-uni',
      platform: { issuer: ISS, deploymentId: '1' },
      ltiSub: over.sub,
      name: over.name,
      email: over.email,
      username: over.username,
      role: over.role,
      context: { id: over.contextId ?? 'course-42', title: 'Kinh doanh số (Moodle)', label: 'DGB301' },
      resourceLink: { id: 'rl-1', title: 'ClassInteract' },
      activity: 'class',
      linkTarget: over.linkTarget ?? 'lt_course42',
      launchId: rid(),
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: TICKET_TYP })
    .setIssuer(HUB)
    .setAudience('classinteractive')
    .setSubject(`u_${over.sub}`)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + 120)
    .sign(privateKey);
}

const launch = async (t: string) => ctx.anon.post('/lti/launch', { ticket: t });
const asUser = async (customToken: string) => new Client(ctx.app, await idTokenFor(customToken));

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  hub = createServer((req, res) => {
    if (req.url === '/lti/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (req.url === '/api/v1/results/bulk' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', async () => {
        const { payload } = await jwtVerify(JSON.parse(raw).result_token, new TextEncoder().encode(SECRET), { issuer: 'classinteractive', audience: HUB });
        const bulk = payload.bulk as Record<string, any>;
        bulkCalls.push(bulk);
        const unmatched = bulk.rows.filter((r: any) => r.username === 'sv999').map((r: any) => ({ username: r.username }));
        const matched = bulk.rows.length - unmatched.length;
        res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'accepted', matched, queued: matched, duplicate: 0, stale_ignored: 0, not_better: 0, unmatched }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => hub.listen(18799, '127.0.0.1', () => r()));

  ctx = await setup();
  await ctx.anon.req('POST', '/setup/bootstrap', { email: 'admin@uni.edu.vn', password: 'Admin@123', displayName: 'Admin' }, { 'x-setup-token': 'test-setup-token' });
  admin = await ctx.login('admin@uni.edu.vn', 'Admin@123');
  await admin.post('/users', { email: 'gv@uni.edu.vn', displayName: 'GV Moodle', role: 'lecturer', password: 'Temp@123' });
  const l = await ctx.anon.post('/auth/login', { loginId: 'gv@uni.edu.vn', password: 'Temp@123' });
  const tmp = new Client(ctx.app, await idTokenFor(l.body.token));
  await new Promise((r) => setTimeout(r, 1100));
  await tmp.post('/auth/change-password', { currentPassword: 'Temp@123', newPassword: 'Giangvien@1' });
  lec = await ctx.login('gv@uni.edu.vn', 'Giangvien@1');
  const course = await lec.post('/courses', { code: 'DGB301', name: 'Kinh doanh số' });
  classId = (await lec.post('/classes', { courseId: course.body.courseId, classCode: 'DGB301.01', semester: 'HK1', academicYear: '2026-2027' })).body.classId;
  // SV001 registered with a password; SV002 imported only; sv999 not on any roster.
  await lec.post(`/classes/${classId}/roster/import`, { rows: [{ studentId: 'SV001', fullName: 'Nguyễn Văn A' }, { studentId: 'SV002', fullName: 'Trần Thị B', email: 'b@st.uni.edu.vn' }] });
  await ctx.anon.post('/auth/register', { studentId: 'SV001', password: 'matkhau1' });
});

afterAll(async () => {
  await ctx?.app.close();
  await new Promise((r) => hub?.close(() => r(null)));
});

let contextKey = '';
let lecLti: Client;
const students: Record<string, { uid: string; client: Client }> = {};

describe('LTI launch through UniGame Hub', () => {
  it('rejects tickets for another tenant, forged tickets and replays', async () => {
    expect((await launch(await ticket({ sub: 't1', role: 'instructor', name: 'GV', email: 'gv@uni.edu.vn', tenantId: 'other-uni' }))).status).toBe(403);
    const forged = (await ticket({ sub: 't1', role: 'instructor', name: 'GV', email: 'gv@uni.edu.vn' })).replace(/\.[^.]+$/, '.AAAA');
    expect((await launch(forged)).status).toBe(401);
    const t = await ticket({ sub: 'x1', role: 'learner', name: 'A', username: 'sv001' });
    await launch(t);
    expect((await launch(t)).status).toBe(401);
  });

  it('students cannot enter before the lecturer links the LMS course to a class', async () => {
    const r = await launch(await ticket({ sub: 'm-sv2', role: 'learner', name: 'Trần Thị B', username: 'sv002' }));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LTI_CLASS_NOT_LINKED');
  });

  it('a lecturer (matched by e-mail) links the LMS course to an existing class', async () => {
    const r = await launch(await ticket({ sub: 'm-gv', role: 'instructor', name: 'GV Moodle', email: 'GV@uni.edu.vn' }));
    expect(r.status).toBe(200);
    expect(r.body.redirect).toMatch(/^\/lti\/link\//);
    contextKey = r.body.redirect.split('/').pop();
    lecLti = await asUser(r.body.token);
    expect((await lecLti.get('/auth/me')).body.user.email).toBe('gv@uni.edu.vn');
    const info = await lecLti.get(`/lti/contexts/${contextKey}`);
    expect(info.status).toBe(200);
    expect(info.body.context.title).toBe('Kinh doanh số (Moodle)');
    expect(info.body.classes.map((c: any) => c.classCode)).toEqual(['DGB301.01']);
    // A student may not link courses.
    const stu = await launch(await ticket({ sub: 'm-sv1', role: 'learner', name: 'Nguyễn Văn A', username: 'sv001' }));
    expect(stu.status).toBe(409);
    const link = await lecLti.post(`/lti/contexts/${contextKey}/link`, { classId });
    expect(link.status).toBe(200);
    // Next launch goes straight to the class.
    const again = await launch(await ticket({ sub: 'm-gv', role: 'instructor', name: 'GV Moodle', email: 'gv@uni.edu.vn' }));
    expect(again.body.redirect).toBe(`/teach/classes/${classId}`);
  });

  it('matches students by student ID = LMS username, creates missing accounts and enrols them', async () => {
    for (const [sub, username, name] of [['m-sv1', 'sv001', 'Nguyễn Văn A'], ['m-sv2', 'sv002', 'Trần Thị B'], ['m-sv9', 'sv999', 'Phạm Mới']] as const) {
      const r = await launch(await ticket({ sub, role: 'learner', name, username }));
      expect(r.status, username).toBe(200);
      expect(r.body.redirect).toBe(`/classes/${classId}`);
      const c = await asUser(r.body.token);
      const me = (await c.get('/auth/me')).body.user;
      expect(me.studentId).toBe(username.toUpperCase());
      students[username] = { uid: me.uid, client: c };
    }
    // SV001 kept the account registered with a password.
    const pw = await ctx.anon.post('/auth/login', { loginId: 'SV001', password: 'matkhau1' });
    expect(pw.body.user.uid).toBe(students.sv001!.uid);
    const members = await lec.get(`/classes/${classId}/members`);
    const ids = (members.body.items ?? members.body.members ?? []).map((m: any) => m.studentId).sort();
    expect(ids).toEqual(['SV001', 'SV002', 'SV999']);
  });

  it('sends students straight into an open session', async () => {
    const sessionId = (await lec.post(`/classes/${classId}/sessions`, { title: 'Buổi 1', date: '2026-11-08', topics: [] })).body.sessionId;
    await lec.post(`/classes/${classId}/sessions/${sessionId}/start`);
    const r = await launch(await ticket({ sub: 'm-sv1', role: 'learner', name: 'Nguyễn Văn A', username: 'sv001' }));
    expect(r.body.redirect).toBe(`/classes/${classId}/sessions/${sessionId}`);
    await students.sv001!.client.post(`/classes/${classId}/sessions/${sessionId}/join`);
    await students.sv001!.client.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content: 'Mô hình doanh thu là gì?', clientRequestId: rid() });
    await lec.post(`/classes/${classId}/sessions/${sessionId}/end`);
  });

  it('sends confirmed scores to the LMS through the Hub and stores the result', async () => {
    const conf = await lec.post(`/classes/${classId}/scores/confirm`);
    expect(conf.status).toBe(200);
    expect(bulkCalls).toHaveLength(1);
    const b = bulkCalls[0]!;
    expect(b).toMatchObject({ link_target: 'lt_course42', batch_id: conf.body.snapshotId, max_score: 100 });
    const byUser = Object.fromEntries(b.rows.map((r: any) => [r.username, r]));
    expect(Object.keys(byUser).sort()).toEqual(['sv001', 'sv002', 'sv999']);
    expect(byUser.sv001.hub_user_id).toBe('u_m-sv1'); // launched before → Hub user id
    expect(byUser.sv002.email).toBe('b@st.uni.edu.vn');
    expect(b.rows.every((r: any) => r.score >= 0 && r.score <= 100)).toBe(true);
    expect(conf.body.lmsSync).toEqual([
      expect.objectContaining({ ok: true, contextTitle: 'Kinh doanh số (Moodle)', matched: 2, queued: 2, unmatched: ['SV999'] }),
    ]);
    const links = await lec.get(`/classes/${classId}/lms-links`);
    expect(links.body).toMatchObject({ enabled: true, items: [expect.objectContaining({ title: 'Kinh doanh số (Moodle)', activities: 1 })] });
    // Resend the same snapshot.
    const re = await lec.post(`/classes/${classId}/scores/snapshots/${conf.body.snapshotId}/push-lms`);
    expect(re.status).toBe(200);
    expect(bulkCalls).toHaveLength(2);
    expect(bulkCalls[1]!.batch_id).toBe(conf.body.snapshotId);
  });

  it('creates a lecturer account for a new LMS instructor, who cannot link classes they do not teach', async () => {
    const r = await launch(await ticket({ sub: 'm-new', role: 'instructor', name: 'TS. Mới', email: 'gv.moi@uni.edu.vn', contextId: 'course-99' }));
    expect(r.status).toBe(200);
    expect(r.body.redirect).toMatch(/^\/lti\/link\//);
    const c = await asUser(r.body.token);
    expect((await c.get('/auth/me')).body.user).toMatchObject({ role: 'lecturer', email: 'gv.moi@uni.edu.vn' });
    const key = r.body.redirect.split('/').pop();
    expect((await c.get(`/lti/contexts/${key}`)).body.classes).toEqual([]);
    expect((await c.post(`/lti/contexts/${key}/link`, { classId })).status).toBe(403);
    // and cannot touch another course's link record
    expect((await c.get(`/lti/contexts/${contextKey}`)).status).toBe(403);
  });

  it('is invisible when the admin API is used without LMS context', async () => {
    expect((await admin.get(`/lti/contexts/unknown-key`)).status).toBe(404);
  });
});
