/**
 * Demo / test data for local development. Runs ONLY against the Firebase Emulator
 * (refuses to touch a real project). Goes through the real API so counters stay consistent.
 *
 *   pnpm emulators            # terminal 1
 *   pnpm seed                 # terminal 2
 */
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Seed chỉ chạy với Firebase Emulator. Đặt FIRESTORE_EMULATOR_HOST và FIREBASE_AUTH_EMULATOR_HOST.');
  process.exit(1);
}
process.env.SETUP_TOKEN ||= 'seed-setup-token';
process.env.LOG_LEVEL = 'silent';
process.env.GCLOUD_PROJECT ||= 'demo-classinteract';

const { buildApp } = await import('../src/app');
const { db } = await import('../src/firebase');

const app = await buildApp();
await app.ready();
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function call(method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const r = await app.inject({
    method: method as never,
    url: `/api/v1${url}`,
    payload: body as never,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return r.json();
}
async function idToken(custom: string) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return ((await r.json()) as { idToken: string }).idToken;
}
const login = async (loginId: string, password: string) => idToken((await call('POST', '/auth/login', { loginId, password })).token);
const rid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const status = await call('GET', '/setup/status');
if (status.initialized) {
  console.log('Dữ liệu đã được seed trước đó. Xóa dữ liệu emulator để seed lại.');
  process.exit(0);
}

await call('POST', '/setup/bootstrap', { email: 'admin@demo.edu.vn', password: 'Admin@123', displayName: 'Quản trị hệ thống' }, undefined, { 'x-setup-token': process.env.SETUP_TOKEN! });
const admin = await login('admin@demo.edu.vn', 'Admin@123');
const { uid: lecUid } = await call('POST', '/users', { email: 'gv.demo@demo.edu.vn', displayName: 'TS. Nguyễn Minh An', role: 'lecturer', password: 'Giangvien@123' }, admin);
await db.collection('users').doc(lecUid).update({ mustChangePassword: false });
const lec = await login('gv.demo@demo.edu.vn', 'Giangvien@123');

const { courseId } = await call('POST', '/courses', { code: 'DGB301', name: 'Kinh doanh số', description: 'Mô hình kinh doanh số, nền tảng, thương mại điện tử, dữ liệu khách hàng.' }, lec);
const { classId } = await call('POST', '/classes', { courseId, classCode: 'DGB301.01', semester: 'HK1', academicYear: '2026-2027', schedule: 'Thứ 3, tiết 1–3, phòng A2.05' }, lec);

const ho = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ'];
const dem = ['Văn', 'Thị', 'Minh', 'Thu', 'Quốc', 'Ngọc', 'Hoài', 'Gia', 'Thanh', 'Bảo'];
const ten = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hương', 'Khánh', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Tuấn', 'Uyên', 'Việt', 'Yến'];
const rows = Array.from({ length: 30 }, (_, i) => ({
  studentId: `SV2026${String(i + 1).padStart(3, '0')}`,
  fullName: `${ho[i % ho.length]} ${dem[(i * 3) % dem.length]} ${ten[(i * 7) % ten.length]}`,
}));
await call('POST', `/classes/${classId}/roster/import`, { rows }, lec);

const students: string[] = [];
for (const r of rows.slice(0, 20)) {
  await call('POST', '/auth/register', { studentId: r.studentId, password: '123456' });
  students.push(await login(r.studentId, '123456'));
}

// Session 1 – held, with Q&A and activities
const s1 = (await call('POST', `/classes/${classId}/sessions`, { title: 'Tổng quan kinh doanh số', date: '2026-10-20', topics: ['Digital Business Models', 'Platform Economy', 'E-commerce'] }, lec)).sessionId;
await call('POST', `/classes/${classId}/sessions/${s1}/start`, {}, lec);
const base1 = `/classes/${classId}/sessions/${s1}`;
const qs = [
  ['Shopee kiếm tiền từ những nguồn nào?', 'Platform Economy'],
  ['Doanh thu của Shopee đến từ đâu ạ?', 'Platform Economy'],
  ['Mô hình kinh doanh số khác gì mô hình truyền thống?', 'Digital Business Models'],
  ['Hiệu ứng mạng lưới (network effect) là gì?', 'Platform Economy'],
  ['Thương mại điện tử B2B2C hoạt động như thế nào?', 'E-commerce'],
  ['Vì sao các sàn TMĐT chấp nhận lỗ nhiều năm?', 'E-commerce'],
];
const qIds: string[] = [];
for (let i = 0; i < qs.length; i++) {
  const [content, topic] = qs[i]!;
  const r = await call('POST', `${base1}/posts`, { type: 'question', content, topics: [topic], isAnonymous: i === 3, clientRequestId: rid() }, students[i]!);
  qIds.push(r.postId);
}
const a1 = await call('POST', `${base1}/posts/${qIds[0]}/replies`, { type: 'answer', content: 'Theo em gồm phí hoa hồng người bán, quảng cáo, phí thanh toán và dịch vụ vận chuyển.', clientRequestId: rid() }, students[7]!);
await call('PATCH', `${base1}/posts/${a1.postId}/moderation`, { isAccepted: true }, lec);
await call('POST', `${base1}/posts/${qIds[2]}/replies`, { type: 'answer', content: 'Mô hình kinh doanh số tạo giá trị chủ yếu từ dữ liệu và nền tảng số, chi phí biên thấp và mở rộng nhanh.', clientRequestId: rid() }, lec);
await call('POST', `${base1}/posts/${qIds[3]}/replies`, { type: 'comment', content: 'Em cũng thắc mắc điều này.', clientRequestId: rid() }, students[9]!);
for (let i = 0; i < 12; i++) {
  await call('POST', `${base1}/posts/${qIds[i % 2 === 0 ? 3 : 5]}/reactions`, { upvoted: true, reaction: i % 3 === 0 ? 'need_explanation' : 'same_question' }, students[i]!);
}
await call('POST', `${base1}/posts`, { type: 'reflection', content: 'Buổi học giúp em hiểu rõ vì sao nền tảng hai mặt cần cả người mua và người bán.', topics: ['Platform Economy'], clientRequestId: rid() }, students[11]!);
const poll = await call('POST', `${base1}/activities`, { type: 'poll', title: 'Bạn đã từng mua hàng bằng TikTok Shop chưa?', options: ['Đã từng', 'Chưa', 'Đang cân nhắc'] }, lec);
const quiz = await call('POST', `${base1}/activities`, { type: 'quiz', title: 'Đâu là nguồn doanh thu chính của sàn TMĐT?', options: ['Phí hoa hồng và quảng cáo', 'Bán hàng tồn kho', 'Thu phí người mua khi đăng nhập'], correctOptionIndexes: [0] }, lec);
const und = await call('POST', `${base1}/activities`, { type: 'understanding', title: 'Bạn đã hiểu khái niệm hiệu ứng mạng lưới chưa?' }, lec);
for (let i = 0; i < 17; i++) {
  await call('POST', `${base1}/activities/${poll.activityId}/submissions`, { optionIds: [`o${(i % 3) + 1}`], clientRequestId: rid() }, students[i]!);
  await call('POST', `${base1}/activities/${quiz.activityId}/submissions`, { optionIds: [i % 4 === 0 ? 'o2' : 'o1'], clientRequestId: rid() }, students[i]!);
  if (i < 14) await call('POST', `${base1}/activities/${und.activityId}/submissions`, { optionIds: [['understood', 'partial', 'not_yet'][i % 3]], clientRequestId: rid() }, students[i]!);
}
await call('POST', `${base1}/end`, { lateReplyMinutes: 0 }, lec);

// Session 2 – planned
await call('POST', `/classes/${classId}/sessions`, { title: 'Mô hình kinh doanh nền tảng số', date: '2026-10-27', topics: ['Platform Economy', 'Revenue Models', 'Customer Analytics'] }, lec);

console.log(`
Seed hoàn tất.
  Quản trị:   admin@demo.edu.vn / Admin@123
  Giảng viên: gv.demo@demo.edu.vn / Giangvien@123
  Sinh viên:  SV2026001 … SV2026020 / 123456 (đã đăng ký)
              SV2026021 … SV2026030 (có trong danh sách, chưa đăng ký – dùng để thử chức năng Đăng ký)
  Lớp:        DGB301.01 – Kinh doanh số
`);
await app.close();
process.exit(0);
export {};
