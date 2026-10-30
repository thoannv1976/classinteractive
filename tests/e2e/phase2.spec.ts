import { expect, test, type Page } from '@playwright/test';
import { LECTURER, apiAs, freshClass, uiLogin, uniq } from './helpers';

test.describe.configure({ mode: 'serial' });

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

test('Phase 2 lecturer pages load; AI summary is generated, approved and published to students', async ({ browser }) => {
  const { lec, classId, sessionId, ids } = await freshClass(1);
  await fetch('http://127.0.0.1:8081/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studentId: ids[0], password: 'matkhau1' }) });
  await lec('POST', `/classes/${classId}/sessions/${sessionId}/start`);
  const stu = await apiAs(ids[0]!, 'matkhau1');
  for (const content of ['Shopee kiếm tiền từ những nguồn nào?', 'Shopee có những nguồn doanh thu nào?']) {
    await stu('POST', `/classes/${classId}/sessions/${sessionId}/posts`, { content, clientRequestId: 'e2e' + uniq() });
  }
  await lec('POST', `/classes/${classId}/sessions/${sessionId}/end`, {}); // queues classification, grouping and summary

  const page = await (await browser.newContext()).newPage();
  const errors = watchErrors(page);
  await uiLogin(page, LECTURER.id, LECTURER.pw);
  for (const [path, text] of [
    ['topics', 'Danh mục chủ đề'],
    ['clusters', 'Nhóm câu hỏi'],
    ['scores', 'Điểm tham gia'],
    ['insights', 'Gợi ý'],
    ['reports', 'Báo cáo trình bày'],
  ] as const) {
    await page.goto(`/teach/classes/${classId}/${path}`);
    await expect(page.getByText(text).first()).toBeVisible();
  }
  // question groups produced by the automatic job
  await page.goto(`/teach/classes/${classId}/clusters`);
  await page.waitForTimeout(500);

  await page.goto(`/teach/classes/${classId}/sessions/${sessionId}?tab=summary`);
  await expect(page.getByText('Nội dung học tập chính').first()).toBeVisible({ timeout: 20_000 });
  const approve = page.getByRole('button', { name: /Duyệt/ }).first();
  await approve.click();
  await page.getByRole('button', { name: /Công bố/ }).first().click();
  await expect(page.getByText(/Đã công bố|Ngừng công bố/).first()).toBeVisible();

  const student = await (await browser.newContext()).newPage();
  await uiLogin(student, ids[0]!, 'matkhau1');
  await student.goto(`/classes/${classId}/sessions/${sessionId}`);
  await expect(student.getByText('Tóm tắt buổi học (giảng viên đã duyệt)')).toBeVisible({ timeout: 20_000 });

  await page.goto(`/print/${classId}/session?sessionId=${sessionId}`);
  await expect(page.getByRole('button', { name: /In \/ Lưu PDF/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('@mobile the interface can be switched to English', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'EN' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.fill('#loginId', 'nobody@x.vn');
  await page.fill('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await expect(page.getByText(/incorrect|not correct|invalid/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'VI' }).first().click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
});
