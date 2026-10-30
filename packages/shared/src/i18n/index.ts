import { LABELS_EN } from './labels-en';
import { SERVER_EN } from './server-en';

export const LANGUAGES = ['vi', 'en'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const isLang = (v: unknown): v is Lang => v === 'vi' || v === 'en';

export type Params = Record<string, string | number | null | undefined>;

/** Replaces {{name}} placeholders. */
export function interpolate(template: string, params?: Params) {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(params[k] ?? ''));
}

/** Vietnamese is the source language; English comes from the dictionaries (falls back to Vietnamese). */
export const EN: Record<string, string> = { ...LABELS_EN, ...SERVER_EN };

export function translate(lang: Lang | undefined, text: string, params?: Params) {
  const t = lang === 'en' ? (EN[text] ?? text) : text;
  return interpolate(t, params);
}

/** A translatable message: Vietnamese template + parameters. */
export interface I18nText {
  key: string;
  params?: Params;
}

export { LABELS_EN, SERVER_EN };
