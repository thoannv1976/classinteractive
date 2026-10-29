import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, idTokenFor, rid, setup } from './test/helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let admin: Client, lecturer: Client, sv1: Client, sv2: Client;
let classId = '';
let otherClassId = '';
let sessionId = '';
let questionId = '';
let answerId = '';

beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('setup & staff accounts', () => {
  it('bootstraps the first super admin only once with the setup token', async () => {
    const bad = await ctx.anon.req('POST', '/setup/bootstrap', { email: 'admin@uni.edu.vn', password: 'Admin@123', displayName: 'Quản trị' }, { 'x-setup-token': 'wrong' });
    expect(bad.status).toBe(403);
    const ok = await ctx.anon.req('POST', '/setup/bootstrap', { email: 'admin@uni.edu.vn', password: 'Admin@123', displayName: 'Quản trị' }, { 'x-setup-token': 'test-setup-token' });
    expect(ok.status).toBe(200);
    const again = await ctx.anon.req('POST', '/setup/bootstrap', { email: 'x@uni.edu.vn', password: 'Admin@123', displayName: 'X' }, { 'x-setup-token': 'test-setup-token' });
    expect(again.status).toBe(409);
    admin = await ctx.login('admin@uni.edu.vn', 'Admin@123');
    const me = await admin.get('/auth/me');
    expect(me.body.user.role).toBe('superadmin');
  });

  it('admin creates a lecturer who must change the password', async () => {
    const r = await admin.post('/users', { email: 'gv.an@uni.edu.vn', displayName: 'TS. Nguyễn An', role: 'lecturer', password: 'Temp@123' });
    expect(r.status).toBe(200);
    const login = await ctx.anon.post('/auth/login', { loginId: 'GV.AN@uni.edu.vn', password: 'Temp@123' });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const tmp = new Client(ctx.app, await idTokenFor(login.body.token));
    const ch = await tmp.post('/auth/change-password', { currentPassword: 'Temp@123', newPassword: 'Giangvien@1' });
    expect(ch.status).toBe(200);
    lecturer = await ctx.login('gv.an@uni.edu.vn', 'Giangvien@1');
    // the old session was revoked
    const old = await tmp.get('/auth/me');
    expect(old.status).toBe(401);
  });
});

describe('classes and roster', () => {
  it('lecturer creates course, class and imports the student list', async () => {
    const course = await lecturer.post('/courses', { code: 'dgb301', name: 'Kinh doanh số' });
    expect(course.status).toBe(200);
    const cls = await lecturer.post('/classes', { courseId: course.body.courseId, classCode: 'DGB301.01', semester: 'HK1', academicYear: '2026-2027' });
    expect(cls.status).toBe(200);
    classId = cls.body.classId;
    const other = await lecturer.post('/classes', { courseId: course.body.courseId, classCode: 'DGB301.02', semester: 'HK1', academicYear: '2026-2027' });
    otherClassId = other.body.classId;
    const imp = await lecturer.post(`/classes/${classId}/roster/import`, {
      rows: [
        { studentId: 'sv001', fullName: 'Nguyễn Văn A' },
        { studentId: 'SV002', fullName: 'Trần Thị B', email: 'b@st.uni.edu.vn' },
        { studentId: 'SV003', fullName: 'Lê Văn C' },
        { studentId: '!!', fullName: '' },
      ],
    });
    expect(imp.status).toBe(200);
    expect(imp.body.result.created).toBe(3);
    expect(imp.body.errors).toHaveLength(1);
  });

  it('Test 1/2/3: roster students register with student ID + password; duplicates and unknown IDs rejected', async () => {
    const unknown = await ctx.anon.post('/auth/register', { studentId: 'SV999', password: '123456' });
    expect(unknown.status).toBe(403);
    expect(unknown.body.error.code).toBe('NOT_IN_ROSTER');
    const r1 = await ctx.anon.post('/auth/register', { studentId: 'sv001', password: 'matkhau1' });
    expect(r1.status).toBe(200);
    expect(r1.body.user.displayName).toBe('Nguyễn Văn A');
    const dup = await ctx.anon.post('/auth/register', { studentId: 'SV001', password: 'other123' });
    expect(dup.status).toBe(409);
    await ctx.anon.post('/auth/register', { studentId: 'SV002', password: 'matkhau2' });
    sv1 = await ctx.login('sv001', 'matkhau1');
    sv2 = await ctx.login('SV002', 'matkhau2');
  });

  it('locks login after repeated failures', async () => {
    await ctx.anon.post('/auth/register', { studentId: 'SV003', password: 'matkhau3' });
    for (let i = 0; i < 5; i++) {
      const r = await ctx.anon.post('/auth/login', { loginId: 'SV003', password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const locked = await ctx.anon.post('/auth/login', { loginId: 'SV003', password: 'matkhau3' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('Test 4: students only see assigned classes', async () => {
    const list = await sv1.get('/classes');
    expect(list.body.items.map((c: any) => c.classId)).toEqual([classId]);
    const other = await sv1.get(`/classes/${otherClassId}`);
    expect(other.status).toBe(403);
    const members = await lecturer.get(`/classes/${classId}/members`);
    expect(members.body.members).toHaveLength(3);
    expect(members.body.pendingRoster).toHaveLength(0);
  });

  it('enrollment request flow for a class the student is not in', async () => {
    const req = await sv1.post('/enrollment-requests', { classCode: 'dgb301.02', message: 'Em học lại' });
    expect(req.status).toBe(200);
    const list = await lecturer.get(`/classes/${otherClassId}/enrollment-requests`);
    expect(list.body.items).toHaveLength(1);
    const ok = await lecturer.post(`/classes/${otherClassId}/enrollment-requests/${list.body.items[0].uid}/decide`, { approve: true });
    expect(ok.status).toBe(200);
    const after = await sv1.get(`/classes/${otherClassId}`);
    expect(after.status).toBe(200);
  });
});

describe('live session & Q&A', () => {
  it('Test 5: lecturer opens a session and students join with the code', async () => {
    const s = await lecturer.post(`/classes/${classId}/sessions`, { title: 'Mô hình kinh doanh nền tảng số', date: '2026-10-29', topics: ['Platform Economy', 'Revenue Models'] });
    expect(s.status).toBe(200);
    sessionId = s.body.sessionId;
    const early = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content: 'Sớm?', clientRequestId: rid() });
    expect(early.status).toBe(409);
    await lecturer.post(`/classes/${classId}/sessions/${sessionId}/start`);
    const detail = await lecturer.get(`/classes/${classId}/sessions/${sessionId}`);
    const code = detail.body.session.joinCode;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const j = await sv1.post('/sessions/join-by-code', { code: code.toLowerCase() });
    expect(j.status).toBe(200);
    expect(j.body.sessionId).toBe(sessionId);
    const j2 = await sv1.post('/sessions/join-by-code', { code });
    expect(j2.status).toBe(200);
    const stats = await lecturer.get(`/classes/${classId}/sessions/${sessionId}`);
    expect(stats.body.stats.attendeeCount).toBe(1);
  });

  it('Test 7: retried question with the same clientRequestId is stored once', async () => {
    const key = rid();
    const body = { type: 'question', content: 'Shopee kiếm tiền từ những nguồn nào?', topics: ['Revenue Models'], clientRequestId: key };
    const a = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, body);
    const b = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, body);
    expect(a.status).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect(a.body.postId).toBe(b.body.postId);
    questionId = a.body.postId;
    const queue = await lecturer.get(`/classes/${classId}/questions`);
    expect(queue.body.items).toHaveLength(1);
  });

  it('Test 6: student answers, lecturer accepts, everything attributed correctly', async () => {
    const ans = await sv2.post(`/classes/${classId}/sessions/${sessionId}/posts/${questionId}/replies`, { type: 'answer', content: 'Phí hoa hồng, quảng cáo và dịch vụ vận chuyển.', clientRequestId: rid() });
    expect(ans.status).toBe(200);
    answerId = ans.body.postId;
    const acc = await lecturer.patch(`/classes/${classId}/sessions/${sessionId}/posts/${answerId}/moderation`, { isAccepted: true });
    expect(acc.status).toBe(200);
    const queue = await lecturer.get(`/classes/${classId}/questions`);
    expect(queue.body.items).toHaveLength(0);
    const profile = await lecturer.get(`/classes/${classId}/analytics/students/${(await sv2.get('/auth/me')).body.user.uid}`);
    expect(profile.body.metrics.answers).toBe(1);
    expect(profile.body.metrics.acceptedAnswers).toBe(1);
    expect(profile.body.posts[0].topics).toEqual(['Revenue Models']);
  });

  it('reactions are one per user and changeable; votes counted once', async () => {
    const url = `/classes/${classId}/sessions/${sessionId}/posts/${questionId}/reactions`;
    await sv2.post(url, { reaction: 'same_question', upvoted: true });
    await sv2.post(url, { reaction: 'need_explanation' });
    await sv2.post(url, { upvoted: true });
    const topics = await lecturer.get(`/classes/${classId}/analytics/topics?topic=Revenue%20Models`);
    const q = topics.body.threads.find((t: any) => t.postId === questionId);
    expect(q.voteCount).toBe(1);
    expect(q.reactionCounts).toEqual({ same_question: 0, need_explanation: 1 });
    expect(q.replies).toHaveLength(1);
  });

  it('anonymous posts hide identity from students', async () => {
    const r = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content: 'Em chưa hiểu network effect', isAnonymous: true, clientRequestId: rid() });
    expect(r.status).toBe(200);
    const reveal = await lecturer.get(`/classes/${classId}/sessions/${sessionId}/posts/${r.body.postId}/author`);
    expect(reveal.status).toBe(403); // class policy does not allow revealing
  });

  it('hiding a post updates counters', async () => {
    const r = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content: 'spam spam', clientRequestId: rid() });
    let s = await lecturer.get(`/classes/${classId}/sessions/${sessionId}`);
    const before = s.body.stats.questionCount;
    await lecturer.patch(`/classes/${classId}/sessions/${sessionId}/posts/${r.body.postId}/moderation`, { moderationStatus: 'hidden' });
    s = await lecturer.get(`/classes/${classId}/sessions/${sessionId}`);
    expect(s.body.stats.questionCount).toBe(before - 1);
  });
});

describe('activities', () => {
  it('poll and quiz results are counted correctly when students change answers', async () => {
    const poll = await lecturer.post(`/classes/${classId}/sessions/${sessionId}/activities`, { type: 'poll', title: 'Bạn đã mua hàng trên TikTok Shop chưa?', options: ['Rồi', 'Chưa'] });
    expect(poll.status).toBe(200);
    const base = `/classes/${classId}/sessions/${sessionId}/activities/${poll.body.activityId}`;
    await sv1.post(`${base}/submissions`, { optionIds: ['o1'], clientRequestId: rid() });
    await sv2.post(`${base}/submissions`, { optionIds: ['o1'], clientRequestId: rid() });
    await sv2.post(`${base}/submissions`, { optionIds: ['o2'], clientRequestId: rid() });
    const lecturerSubmit = await lecturer.post(`${base}/submissions`, { optionIds: ['o2'], clientRequestId: rid() });
    expect(lecturerSubmit.status).toBe(403);
    const res = await lecturer.get(`${base}/results`);
    expect(res.body.results.submissionCount).toBe(2);
    expect(res.body.results.optionCounts).toEqual({ o1: 1, o2: 1 });

    const quiz = await lecturer.post(`/classes/${classId}/sessions/${sessionId}/activities`, { type: 'quiz', title: 'Network effect là gì?', options: ['A', 'B', 'C'], correctOptionIndexes: [1] });
    const qb = `/classes/${classId}/sessions/${sessionId}/activities/${quiz.body.activityId}`;
    await sv1.post(`${qb}/submissions`, { optionIds: ['o2'], clientRequestId: rid() });
    await sv2.post(`${qb}/submissions`, { optionIds: ['o1'], clientRequestId: rid() });
    const qr = await lecturer.get(`${qb}/results`);
    expect(qr.body.results.correctCount).toBe(1);
    await lecturer.post(`${qb}/close`);
    const late = await sv2.post(`${qb}/submissions`, { optionIds: ['o2'], clientRequestId: rid() });
    expect(late.status).toBe(409);
  });
});

describe('analytics & export', () => {
  it('Test 15: per-student counts match the interactions performed', async () => {
    const r = await lecturer.get(`/classes/${classId}/analytics/students`);
    expect(r.status).toBe(200);
    const a = r.body.rows.find((x: any) => x.studentId === 'SV001');
    const b = r.body.rows.find((x: any) => x.studentId === 'SV002');
    // SV001: question (Shopee) + anonymous question; hidden spam not counted. 2 activities.
    expect(a.questions).toBe(2);
    expect(a.activitiesCompleted).toBe(2);
    expect(a.sessionsJoined).toBe(1);
    expect(a.quizCorrect).toBe(1);
    expect(b.answers).toBe(1);
    expect(b.reactions).toBe(1);
    expect(b.activitiesCompleted).toBe(2);
    expect(b.sessionsJoined).toBe(1);
    expect(r.body.opportunities).toEqual({ sessionsHeld: 1, activitiesOpened: 2 });
    expect(b.activityCompletionRate).toBe(1);
    const overview = await lecturer.get(`/classes/${classId}/analytics/overview`);
    expect(overview.body.totals.students).toBe(3);
    expect(overview.body.totals.interacted).toBe(2);
  });

  it('Test 10: lecturer downloads Excel; students cannot', async () => {
    const x = await lecturer.get(`/classes/${classId}/export?format=xlsx`);
    expect(x.status).toBe(200);
    expect(x.raw.headers['content-type']).toContain('spreadsheetml');
    expect(x.raw.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const csv = await lecturer.get(`/classes/${classId}/export?format=csv&dataset=questions`);
    expect(csv.raw.body).toContain('Shopee kiếm tiền');
    expect(csv.raw.body).not.toContain('Em chưa hiểu network effect,Nguyễn Văn A');
    const denied = await sv1.get(`/classes/${classId}/export?format=xlsx`);
    expect(denied.status).toBe(403);
  });
});

describe('AI', () => {
  it('Test 8: AI drafts an answer, lecturer publishes it with an AI label', async () => {
    const r = await lecturer.post('/ai/answer', { classId, sessionId, postId: questionId });
    expect(r.status).toBe(200);
    expect(r.body.output.shortAnswer).toBeTruthy();
    const students = await sv1.post('/ai/answer', { classId, sessionId, postId: questionId });
    expect(students.status).toBe(403);
    const pub = await lecturer.post(`/ai/runs/${r.body.runId}/publish`, { content: r.body.content });
    expect(pub.status).toBe(200);
    const runs = await lecturer.get(`/ai/runs?classId=${classId}`);
    expect(runs.body.items[0].approvalStatus).toBe('published');
    expect(runs.body.items[0].tokenUsage.input).toBe(100);
  });

  it('Test 14: provider failure does not break classroom interaction', async () => {
    const q = await sv1.post(`/classes/${classId}/sessions/${sessionId}/posts`, { content: 'Câu hỏi [[FAIL]] cho AI', clientRequestId: rid() });
    const r = await lecturer.post('/ai/answer', { classId, sessionId, postId: q.body.postId });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('AI_PROVIDER_ERROR');
    const reply = await sv2.post(`/classes/${classId}/sessions/${sessionId}/posts/${q.body.postId}/replies`, { content: 'Vẫn trả lời được', clientRequestId: rid() });
    expect(reply.status).toBe(200);
  });
});

describe('security', () => {
  it('Test 12: students cannot call admin APIs or change roles', async () => {
    expect((await sv1.get('/users')).status).toBe(403);
    expect((await sv1.get('/admin/overview')).status).toBe(403);
    const me = (await sv1.get('/auth/me')).body.user;
    expect((await sv1.patch(`/users/${me.uid}/role`, { role: 'admin' })).status).toBe(403);
    expect((await sv1.patch(`/classes/${classId}`, { name: 'hack' })).status).toBe(403);
    expect((await sv1.get(`/classes/${classId}/analytics/students`)).status).toBe(403);
    expect((await lecturer.get('/users')).status).toBe(403);
  });

  it('lecturer resets a student password', async () => {
    const uid = (await sv2.get('/auth/me')).body.user.uid;
    const r = await lecturer.post(`/users/${uid}/reset-password`, {});
    expect(r.status).toBe(200);
    const login = await ctx.anon.post('/auth/login', { loginId: 'SV002', password: r.body.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('Test 11: disabling an account blocks new logins and existing sessions', async () => {
    const uid = (await sv1.get('/auth/me')).body.user.uid;
    const r = await admin.patch(`/users/${uid}/status`, { status: 'disabled' });
    expect(r.status).toBe(200);
    const existing = await sv1.get('/classes');
    expect(existing.status).toBe(401);
    const login = await ctx.anon.post('/auth/login', { loginId: 'SV001', password: 'matkhau1' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
    const audit = await admin.get('/admin/audit-logs?action=user.disable');
    expect(audit.body.items).toHaveLength(1);
  });
});
