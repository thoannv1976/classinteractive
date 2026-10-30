import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, idTokenFor, rid, setup } from './test/helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let admin: Client, lec: Client, s1: Client, s2: Client, s3: Client;
let classId = '';
let sessionId = '';
const q: Record<string, string> = {};

async function waitJob(c: Client, jobId: string) {
  for (let i = 0; i < 100; i++) {
    const r = await c.get(`/classes/${classId}/ai-jobs`);
    const j = r.body.items.find((x: any) => x.jobId === jobId);
    if (j && (j.status === 'completed' || j.status === 'failed')) return j;
    await new Promise((res) => setTimeout(res, 150));
  }
  throw new Error('job timeout');
}
const startJob = async (body: Record<string, unknown>) => {
  const r = await lec.post(`/classes/${classId}/ai-jobs`, body);
  expect(r.status).toBe(200);
  return waitJob(lec, r.body.jobId);
};

beforeAll(async () => {
  ctx = await setup();
  await ctx.anon.req('POST', '/setup/bootstrap', { email: 'admin@uni.edu.vn', password: 'Admin@123', displayName: 'Admin' }, { 'x-setup-token': 'test-setup-token' });
  admin = await ctx.login('admin@uni.edu.vn', 'Admin@123');
  await admin.post('/users', { email: 'gv@uni.edu.vn', displayName: 'GV', role: 'lecturer', password: 'Temp@123' });
  const l = await ctx.anon.post('/auth/login', { loginId: 'gv@uni.edu.vn', password: 'Temp@123' });
  const tmp = new Client(ctx.app, await idTokenFor(l.body.token));
  await new Promise((r) => setTimeout(r, 1100));
  await tmp.post('/auth/change-password', { currentPassword: 'Temp@123', newPassword: 'Giangvien@1' });
  lec = await ctx.login('gv@uni.edu.vn', 'Giangvien@1');
  const course = await lec.post('/courses', { code: 'DGB301', name: 'Kinh doanh số' });
  classId = (await lec.post('/classes', { courseId: course.body.courseId, classCode: 'DGB301.01', semester: 'HK1', academicYear: '2026-2027' })).body.classId;
  await lec.post(`/classes/${classId}/roster/import`, { rows: ['SV1', 'SV2', 'SV3'].map((id) => ({ studentId: id, fullName: `Sinh viên ${id}` })) });
  for (const id of ['SV1', 'SV2', 'SV3']) await ctx.anon.post('/auth/register', { studentId: id, password: 'matkhau1' });
  [s1, s2, s3] = [await ctx.login('SV1', 'matkhau1'), await ctx.login('SV2', 'matkhau1'), await ctx.login('SV3', 'matkhau1')];
  sessionId = (await lec.post(`/classes/${classId}/sessions`, { title: 'Nền tảng thương mại điện tử', date: '2026-10-30', topics: ['Revenue Models'] })).body.sessionId;
  await lec.post(`/classes/${classId}/sessions/${sessionId}/start`);
  const post = (c: Client, content: string) => c.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content, clientRequestId: rid() }).then((r) => r.body.postId as string);
  q.a = await post(s1, 'Shopee kiếm tiền từ những nguồn nào?');
  q.b = await post(s2, 'Shopee có những nguồn doanh thu nào?');
  q.c = await post(s3, 'Hiệu ứng mạng lưới trong revenue models là gì?');
  await lec.post(`/classes/${classId}/sessions/${sessionId}/posts/${q.a}/replies`, { content: 'Phí hoa hồng và quảng cáo.', clientRequestId: rid() });
});
afterAll(async () => ctx?.app.close());

describe('exit ticket', () => {
  it('collects three answers and is counted separately', async () => {
    const act = await lec.post(`/classes/${classId}/sessions/${sessionId}/activities`, { type: 'exit_ticket', title: 'Phiếu cuối buổi' });
    expect(act.status).toBe(200);
    const base = `/classes/${classId}/sessions/${sessionId}/activities/${act.body.activityId}`;
    expect((await s1.post(`${base}/submissions`, { answers: ['', '', ''], clientRequestId: rid() })).status).toBe(400);
    expect((await s1.post(`${base}/submissions`, { answers: ['Mô hình nền tảng', 'Network effect', 'Dữ liệu khách hàng'], clientRequestId: rid() })).status).toBe(200);
    const d = await lec.get(`/classes/${classId}/sessions/${sessionId}`);
    expect(d.body.stats.exitTicketCount).toBe(1);
    const summary = await startJob({ type: 'summarize_activity', sessionId, activityId: act.body.activityId });
    expect(summary.status).toBe('completed');
    const ai = await lec.get(`${base}/ai-summary`);
    expect(ai.body.summary.overview).toBeTruthy();
    expect((await s1.get(`${base}/ai-summary`)).status).toBe(403);
  });
});

describe('topics', () => {
  it('AI suggests topics; lecturer reviews; AI suggestion is kept', async () => {
    const job = await startJob({ type: 'classify_topics', sessionId });
    expect(job.status).toBe('completed');
    const pending = await lec.get(`/classes/${classId}/topic-reviews`);
    const c = pending.body.items.find((p: any) => p.postId === q.c);
    expect(c.aiTopics).toEqual(['Revenue Models']);
    const r = await lec.post(`/classes/${classId}/topic-reviews`, { items: [{ sessionId, postId: q.c, action: 'accept' }] });
    expect(r.status).toBe(200);
    expect((await s1.post(`/classes/${classId}/topic-reviews`, { items: [{ sessionId, postId: q.c, action: 'accept' }] })).status).toBe(403);
    const topics = await lec.get(`/classes/${classId}/topics`);
    expect(topics.body.items.find((t: any) => t.name === 'Revenue Models').questions).toBe(1);
  });

  it('rename, move and merge update posts', async () => {
    const ren = await lec.patch(`/classes/${classId}/topics/${encodeURIComponent('Revenue Models')}`, { name: 'Mô hình doanh thu' });
    expect(ren.body.postsUpdated).toBe(1);
    await lec.post(`/classes/${classId}/topics/move`, { posts: [{ sessionId, postId: q.a }, { sessionId, postId: q.b }], add: ['Shopee'] });
    await lec.post(`/classes/${classId}/topics/merge`, { from: ['Shopee'], into: 'Mô hình doanh thu' });
    const topics = await lec.get(`/classes/${classId}/topics`);
    const t = topics.body.items.find((x: any) => x.name === 'Mô hình doanh thu');
    expect(t.questions).toBe(3);
    expect(topics.body.items.some((x: any) => x.name === 'Shopee')).toBe(false);
  });
});

describe('question clusters', () => {
  it('groups similar questions; lecturer edits are kept on re-run', async () => {
    const job = await startJob({ type: 'cluster_questions', sessionId });
    expect(job.result.method).toBe('embedding');
    const list = await lec.get(`/classes/${classId}/clusters?scope=session&sessionId=${sessionId}`);
    const shopee = list.body.clusters.find((c: any) => c.items.some((i: any) => i.postId === q.a));
    expect(shopee.items.map((i: any) => i.postId)).toContain(q.b);
    expect(shopee.studentCount).toBe(2);
    await lec.patch(`/classes/${classId}/clusters/${shopee.clusterId}`, { name: 'Nguồn doanh thu của Shopee' });
    await startJob({ type: 'cluster_questions', sessionId, force: true });
    const again = await lec.get(`/classes/${classId}/clusters?scope=session&sessionId=${sessionId}`);
    expect(again.body.clusters.find((c: any) => c.clusterId === shopee.clusterId).name).toBe('Nguồn doanh thu của Shopee');
    expect((await s1.get(`/classes/${classId}/clusters`)).status).toBe(403);
  });

  it('suggests semantically similar questions while typing', async () => {
    const r = await s3.post(`/classes/${classId}/similar-questions`, { text: 'Shopee kiếm tiền từ nguồn nào vậy?', sessionId });
    expect(r.body.method).toBe('embedding');
    expect(r.body.items[0].postId).toBe(q.a);
  });
});

describe('session summary', () => {
  it('draft → approve → publish; students only see the published version; refs are real posts', async () => {
    const job = await startJob({ type: 'summarize_session', sessionId });
    expect(job.status).toBe('completed');
    const sum = await lec.get(`/classes/${classId}/sessions/${sessionId}/summary`);
    expect(sum.body.summary.status).toBe('draft');
    expect(sum.body.summary.sections.nextSession[0].refs).toEqual([]);
    expect(sum.body.summary.sections.keyQuestions[0].refs.length).toBeGreaterThan(0);
    expect((await s1.get(`/classes/${classId}/sessions/${sessionId}/summary`)).body.summary).toBeNull();
    expect((await lec.put(`/classes/${classId}/sessions/${sessionId}/summary`, { published: true })).status).toBe(400);
    await lec.put(`/classes/${classId}/sessions/${sessionId}/summary`, { status: 'approved', published: true });
    expect((await s1.get(`/classes/${classId}/sessions/${sessionId}/summary`)).body.summary.published).toBe(true);
    const notif = await lec.get('/auth/me');
    expect(notif.status).toBe(200);
  });
});

describe('teaching insights', () => {
  it('produces evidence-based insights', async () => {
    const job = await startJob({ type: 'teaching_insights' });
    expect(job.status).toBe('completed');
    const r = await lec.get(`/classes/${classId}/insights`);
    expect(r.body.insights.insights[0].evidence.length).toBeGreaterThan(0);
  });
});

describe('engagement score', () => {
  it('is computed with versioned weights, adjustable and confirmable', async () => {
    const r = await lec.get(`/classes/${classId}/scores`);
    expect(r.body.config.version).toBe(1);
    const row = r.body.rows.find((x: any) => x.studentId === 'SV1');
    expect(row.components.exitTickets.value).toBe(1);
    expect(row.score).toBeGreaterThan(0);
    const bad = await lec.put(`/classes/${classId}/score-config`, { weights: { activities: 50, answers: 50, questions: 20, helpful: 0, exitTickets: 0 }, caps: { answers: 3, questions: 2, helpful: 2 }, basis: 'held' });
    expect(bad.status).toBe(400);
    const ok = await lec.put(`/classes/${classId}/score-config`, { weights: { activities: 20, answers: 20, questions: 40, helpful: 10, exitTickets: 10 }, caps: { answers: 3, questions: 1, helpful: 2 }, basis: 'held' });
    expect(ok.body.version).toBe(2);
    await lec.put(`/classes/${classId}/score-adjustments/${row.uid}`, { delta: 5, note: 'Trình bày tốt' });
    const after = (await lec.get(`/classes/${classId}/scores`)).body.rows.find((x: any) => x.studentId === 'SV1');
    expect(after.adjustment).toBe(5);
    expect((await s1.get(`/classes/${classId}/scores/me`)).status).toBe(403);
    await lec.patch(`/classes/${classId}`, { settings: { showScoreToStudents: true } });
    const mine = await s1.get(`/classes/${classId}/scores/me`);
    expect(mine.body.row.score).toBe(after.score);
    expect(mine.body.row.adjustmentNote).toBeUndefined();
    const conf = await lec.post(`/classes/${classId}/scores/confirm`);
    expect(conf.status).toBe(200);
    const csv = await lec.get(`/classes/${classId}/export?format=csv&dataset=scores`);
    expect(csv.raw.body).toContain('SV1');
    expect((await s1.get(`/classes/${classId}/scores`)).status).toBe(403);
  });
});

describe('automatic AI after a session', () => {
  it('ending a session queues classification, clustering and summary', async () => {
    const r = await lec.post(`/classes/${classId}/sessions/${sessionId}/end`, {});
    expect(r.body.aiJobs).toBe(3);
    const jobs = await lec.get(`/classes/${classId}/ai-jobs`);
    expect(jobs.body.items.length).toBeGreaterThanOrEqual(3);
  });
});
