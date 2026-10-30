import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LABELS_EN } from '@classinteract/shared';
import { EN_DICTIONARY } from './en';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const EN = { ...LABELS_EN, ...EN_DICTIONARY };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : files(p);
    return /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

/** Literal keys passed to t('…') / i18n.t('…') / <Trans i18nKey="…">. */
function keysIn(code: string) {
  const keys: string[] = [];
  const re = /\b(?:t|tk)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1] === '`' && m[2]!.includes('${')) continue; // dynamic – not checkable
    keys.push(m[2]!.replace(/\\(['"`])/g, '$1').replace(/\\n/g, '\n'));
  }
  return keys;
}

const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

describe('i18n coverage', () => {
  const all = files(SRC).map((f) => ({ f, code: readFileSync(f, 'utf8') }));

  it('every t() key has an English translation', () => {
    const missing = new Set<string>();
    for (const { f, code } of all) for (const k of keysIn(code)) if (!(k in EN)) missing.add(`${f.replace(SRC, '')}: ${k}`);
    expect([...missing]).toEqual([]);
  });

  it('no English entry is left untranslated', () => {
    const same = Object.entries(EN).filter(([k, v]) => VIETNAMESE.test(v) || !v.trim()).map(([k]) => k);
    expect(same).toEqual([]);
  });
});
