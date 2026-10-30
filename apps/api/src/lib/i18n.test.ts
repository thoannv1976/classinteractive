import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EN } from '@classinteract/shared';

/**
 * Every Vietnamese message the API can send to a user must have an English translation in
 * packages/shared/src/i18n/server-en.ts (or labels-en.ts). Covered: error helpers, AppError,
 * notification titles/bodies and Zod messages in packages/shared/src/schemas.ts.
 */
const API_SRC = fileURLToPath(new URL('..', import.meta.url));
const SCHEMAS = fileURLToPath(new URL('../../../../packages/shared/src/schemas.ts', import.meta.url));
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return f.endsWith('.ts') && !f.endsWith('.test.ts') ? [p] : [];
  });
}

const PATTERNS = [
  /\b(?:badRequest|unauthorized|forbidden|notFound|conflict|tooMany)\(\s*'([^']+)'/g,
  /new AppError\(\s*\d+\s*,\s*'[A-Z_]+'\s*,\s*'([^']+)'/g,
  /\b(?:title|body):\s*'([^']+)'/g,
  /translate\([^,]+,\s*'([^']+)'/g,
  /\bT\('([^']+)'/g,
];

function messages(code: string) {
  const out: string[] = [];
  for (const re of PATTERNS) for (const m of code.matchAll(re)) if (VI.test(m[1]!)) out.push(m[1]!);
  return out;
}

describe('server i18n coverage', () => {
  it('every user-facing API message has English', () => {
    const missing = new Set<string>();
    for (const f of files(API_SRC)) for (const m of messages(readFileSync(f, 'utf8'))) if (!(m in EN)) missing.add(m);
    expect([...missing].sort()).toEqual([]);
  });

  it('every Vietnamese validation message has English', () => {
    const code = readFileSync(SCHEMAS, 'utf8').replace(/\$\{LIMITS\.(\w+)\}/g, (_, k) => `\${${k}}`);
    const lits = [...code.matchAll(/'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]!).filter((s) => VI.test(s));
    // template literals with LIMITS are checked in their rendered form
    const limits: Record<string, number> = { passwordMin: 6 };
    const rendered = lits.map((s) => s.replace(/\$\{(\w+)\}/g, (_, k) => String(limits[k] ?? k)));
    expect(rendered.filter((m) => !(m in EN)).sort()).toEqual([]);
  });
});
