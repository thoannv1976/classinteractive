import i18n, { currentLang } from '@/i18n';
import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) return {};
  return { authorization: `Bearer ${await u.getIdToken()}` };
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-lang': currentLang(), ...(await authHeader()) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', i18n.t('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'));
  }
  if (res.status === 401 && retry && auth.currentUser) {
    // Token may have just been refreshed server side; force refresh once.
    await auth.currentUser.getIdToken(true).catch(() => undefined);
    return request<T>(method, path, body, false);
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && (e?.code === 'SESSION_REVOKED' || !retry)) window.dispatchEvent(new Event('ci:session-revoked'));
    if (res.status === 403 && e?.code === 'ACCOUNT_DISABLED') window.dispatchEvent(new Event('ci:session-revoked'));
    throw new ApiError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? i18n.t('Có lỗi xảy ra'), e?.details);
  }
  return json as T;
}

const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T>(p: string, b: unknown = {}) => request<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  /** Downloads a file produced by the API (export). */
  async download(path: string, fallbackName: string) {
    const res = await fetch(BASE + path, { headers: { 'x-lang': currentLang(), ...(await authHeader()) } });
    if (!res.ok) {
      const j = safeJson(await res.text());
      throw new ApiError(res.status, j?.error?.code ?? 'HTTP', j?.error?.message ?? i18n.t('Không tải được file'));
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : i18n.t('Có lỗi xảy ra');
