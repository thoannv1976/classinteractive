import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Time } from '@classinteract/shared';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function toDate(v: Time | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
}

const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
export function timeAgo(v: Time | null | undefined) {
  const d = toDate(v);
  if (!d) return 'vừa xong';
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'vừa xong';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return d.toLocaleDateString('vi-VN');
}

export function formatDateTime(v: Time | null | undefined) {
  const d = toDate(v);
  return d ? d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export function formatDate(s: string | null | undefined) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export const pct = (r: number | null | undefined, digits = 0) =>
  r === null || r === undefined ? '—' : `${(r * 100).toFixed(digits)}%`;

/** Random idempotency key for create requests (retries reuse the same key). */
export const requestId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
