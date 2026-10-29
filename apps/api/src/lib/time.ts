import type { Timestamp } from 'firebase-admin/firestore';

/** Convert Firestore values to JSON-friendly ISO strings, recursively. */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as unknown as Timestamp).toDate().toISOString() as unknown as T;
  }
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => serialize(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out as T;
  }
  return value;
}

export const toMillis = (v: unknown): number | null => {
  if (!v) return null;
  if (typeof (v as Timestamp).toMillis === 'function') return (v as Timestamp).toMillis();
  if (typeof v === 'string') return Date.parse(v);
  if (v instanceof Date) return v.getTime();
  return null;
};

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
