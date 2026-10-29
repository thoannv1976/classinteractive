import { expect, test } from '@playwright/test';
import { ADMIN, LECTURER, apiAs, freshClass, uiLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

test('@mobile Test 1–4: student registers with student ID, sees only assigned class', async ({ page, browser }) => {
  const { ids, tag } = await freshClass(2);
  await page.goto('/register');
  await page.fill('#studentId', ids[0]!.toLowerCase());
  await page.fill('#password', 'matkhau1');
  await page.fill('#confirm', 'matkhau1');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText('Xin chào, Sinh Viên E2E 1')).toBeVisible();
  await page.goto('/classes');
  await expect(page.getByRole('link', { name: new RegExp(`E2E\\.${tag}`) }).last()).toBeVisible();
  await expect(page.getByRole('main').getByText('DGB301.01')).toHaveCount(0);

  // Test 3: the same student ID cannot be registered twice
  const other = await (await browser.newContext()).newPage();
  await other.goto('/register');
  await other.fill('#studentId', ids[0]!);
  await other.fill('#password', 'khac1234');
  await other.fill('#confirm', 'khac1234');
  await other.click('button[type=submit]');
  await expect(other.getByText('đã được đăng ký')).toBeVisible();
});

test('unknown student ID cannot register', async ({ page }) => {
  await page.goto('/register');
  await page.fill('#studentId', 'KHONGCO999');
  await page.fill('#password', 'matkhau1');
  await page.fill('#confirm', 'matkhau1');
  await page.click('button[type=submit]');
  await expect(page.getByText('chưa có trong danh sách lớp')).toBeVisible();
});

test('Test 5–6: live Q&A appears for the lecturer without reload; answer is accepted', async ({ browser }) => {
  const { lec, classId, sessionId, ids } = await freshClass(1);
  await fetch('http://127.0.0.1:8081/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ids[0], password: 'matkhau1' }) });
  await lec('POST', `/classes/${classId}/sessions/${sessionId}/start`);
  const detail = await lec<{ session: { joinCode: string } }>('GET', `/classes/${classId}/sessions/${sessionId}`);

  const lecturer = await (await browser.newContext()).newPage();
  await uiLogin(lecturer, LECTURER.id, LECTURER.pw);
  await lecturer.goto(`/teach/classes/${classId}/sessions/${sessionId}`);
  await expect(lecturer.getByText(detail.session.joinCode).filter({ visible: true }).first()).toBeVisible();

  const student = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await uiLogin(student, ids[0]!, 'matkhau1');
  await student.goto(`/join/${detail.session.joinCode}`);
  await expect(student).toHaveURL(new RegExp(`/sessions/${sessionId}`));
  const question = `Shopee có những nguồn doanh thu nào? ${Date.now()}`;
  await student.getByLabel('Câu hỏi').fill(question);
  await student.getByRole('button', { name: 'Revenue Models' }).click();
  await student.getByRole('button', { name: 'Gửi' }).click();
  await expect(student.getByText('Đã gửi câu hỏi')).toBeVisible();

  // Lecturer sees it live (no reload)
  const card = lecturer.locator('article', { hasText: question });
  await expect(card).toBeVisible();
  await card.getByText(question).click();
  await lecturer.getByLabel('Nội dung phản hồi').fill('Phí hoa hồng, quảng cáo, thanh toán và vận chuyển.');
  await lecturer.getByRole('button', { name: 'Gửi' }).last().click();
  await expect(lecturer.getByText('Phí hoa hồng, quảng cáo').first()).toBeVisible();

  // Student's question is now answered (live)
  await expect(student.locator('article', { hasText: question }).getByText('Đã trả lời')).toBeVisible();

  // Test 7: counted exactly once
  const rows = await lec<{ rows: { studentId: string; questions: number; sessionsJoined: number }[] }>('GET', `/classes/${classId}/analytics/students`);
  expect(rows.rows[0]).toMatchObject({ studentId: ids[0], questions: 1, sessionsJoined: 1 });
});

test('activities: poll results update live; AI draft is published with label (Test 8)', async ({ browser }) => {
  const { lec, classId, sessionId, ids } = await freshClass(1);
  await fetch('http://127.0.0.1:8081/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ids[0], password: 'matkhau1' }) });
  await lec('POST', `/classes/${classId}/sessions/${sessionId}/start`);
  const stu = await apiAs(ids[0]!, 'matkhau1');
  const { postId } = await stu<{ postId: string }>('POST', `/classes/${classId}/sessions/${sessionId}/posts`, { content: 'Hiệu ứng mạng lưới là gì?', clientRequestId: 'e2e' + Date.now() });

  const page = await (await browser.newContext()).newPage();
  await uiLogin(page, LECTURER.id, LECTURER.pw);
  await page.goto(`/teach/classes/${classId}/sessions/${sessionId}?tab=activities`);
  await page.getByRole('button', { name: 'Tạo hoạt động' }).first().click();
  await page.getByRole('button', { name: 'Khảo sát ý kiến' }).click();
  await page.fill('#act-title', 'Bạn dùng sàn nào?');
  await page.getByPlaceholder('Phương án A').fill('Shopee');
  await page.getByPlaceholder('Phương án B').fill('Lazada');
  await page.getByRole('button', { name: 'Tạo và mở ngay' }).click();
  await expect(page.getByText('0 lượt trả lời')).toBeVisible();
  const acts = await lec<{ activities: { activityId: string }[] }>('GET', `/classes/${classId}/sessions/${sessionId}/analytics`);
  await stu('POST', `/classes/${classId}/sessions/${sessionId}/activities/${acts.activities[0]!.activityId}/submissions`, { optionIds: ['o1'], clientRequestId: 'e2e' + Date.now() });
  await expect(page.getByText('1 lượt trả lời')).toBeVisible();

  await page.goto(`/teach/classes/${classId}/sessions/${sessionId}/posts/${postId}`);
  await page.locator('article').first().getByRole('button', { name: 'Thao tác' }).click();
  await page.getByText('AI đề xuất trả lời').click();
  await expect(page.getByText('AI Generated').first()).toBeVisible();
  await page.getByRole('button', { name: 'Duyệt và công bố' }).click();
  await expect(page.locator('article', { hasText: 'Trợ lý AI' }).getByText('AI Generated')).toBeVisible();
});

test('Test 11–12: disabled student is signed out; students cannot open admin pages', async ({ browser }) => {
  const { ids } = await freshClass(1);
  await fetch('http://127.0.0.1:8081/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ids[0], password: 'matkhau1' }) });
  const page = await (await browser.newContext()).newPage();
  await uiLogin(page, ids[0]!, 'matkhau1');
  await page.goto('/admin/users');
  await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible();
  await page.goto('/classes');

  const admin = await apiAs(ADMIN.id, ADMIN.pw);
  const users = await admin<{ items: { uid: string }[] }>('GET', `/users?q=${ids[0]}`);
  await admin('PATCH', `/users/${users.items[0]!.uid}/status`, { status: 'disabled' });
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await page.fill('#loginId', ids[0]!);
  await page.fill('#password', 'matkhau1');
  await page.click('button[type=submit]');
  await expect(page.getByText('Tài khoản đã bị khóa')).toBeVisible();
});

test('@mobile Test 13: main student screens work on a phone', async ({ page }) => {
  const { lec, classId, sessionId, ids } = await freshClass(1);
  await fetch('http://127.0.0.1:8081/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ids[0], password: 'matkhau1' }) });
  await lec('POST', `/classes/${classId}/sessions/${sessionId}/start`);
  await uiLogin(page, ids[0]!, 'matkhau1');
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await page.getByRole('link', { name: /Buổi kiểm thử/ }).first().click();
  await expect(page.getByRole('tab', { name: /Hỏi đáp/ })).toBeVisible();
  const box = await page.locator('main').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});
