import { expect, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8081/api/v1';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

export const LECTURER = { id: 'gv.demo@demo.edu.vn', pw: 'Giangvien@123' };
export const ADMIN = { id: 'admin@demo.edu.vn', pw: 'Admin@123' };

export async function uiLogin(page: Page, id: string, pw: string) {
  await page.goto('/login');
  await page.fill('#loginId', id);
  await page.fill('#password', pw);
  await page.click('button[type=submit]');
  await expect(page).not.toHaveURL(/\/login/);
}

/** API client (as a given user) for test data setup. */
export async function apiAs(loginId: string, password: string) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password }) });
  const { token } = (await r.json()) as { token: string };
  const ex = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const { idToken } = (await ex.json()) as { idToken: string };
  return async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${idToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j)}`);
    return j as T;
  };
}

export const uniq = () => Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

/** Creates a fresh class + session + roster with N students (registered via API). */
export async function freshClass(students: number) {
  const lec = await apiAs(LECTURER.id, LECTURER.pw);
  const tag = uniq();
  const courses = await lec<{ items: { courseId: string; code: string }[] }>('GET', '/courses');
  const courseId = courses.items.find((c) => c.code === 'DGB301')!.courseId;
  const { classId } = await lec<{ classId: string }>('POST', '/classes', { courseId, classCode: `E2E.${tag}`, semester: 'HK1', academicYear: '2026-2027' });
  const ids = Array.from({ length: students }, (_, i) => `E${tag}${i}`);
  await lec('POST', `/classes/${classId}/roster/import`, { rows: ids.map((studentId, i) => ({ studentId, fullName: `Sinh Viên E2E ${i + 1}` })) });
  const { sessionId } = await lec<{ sessionId: string }>('POST', `/classes/${classId}/sessions`, { title: `Buổi kiểm thử ${tag}`, date: '2026-10-29', topics: ['Revenue Models'] });
  return { lec, classId, sessionId, ids, tag };
}
