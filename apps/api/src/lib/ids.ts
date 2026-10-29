import { createHash, randomInt } from 'node:crypto';

/** Deterministic document id from parts – used for idempotent creates (client retry safe). */
export function stableId(...parts: string[]) {
  return createHash('sha256').update(parts.join('\u0000')).digest('base64url').slice(0, 22);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function joinCode(length = 6) {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export const loginKey = (tenantId: string, kind: 'sid' | 'email', value: string) =>
  `${tenantId}__${kind}__${value}`.replace(/\//g, '_');
export const directoryKey = (tenantId: string, studentId: string) => `${tenantId}__${studentId}`.replace(/\//g, '_');
