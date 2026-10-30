import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { EN as SHARED_EN, isLang, type Lang } from '@classinteract/shared';
import { EN_DICTIONARY } from './en';

/**
 * Vietnamese is the source language: UI strings are written in Vietnamese and used as keys,
 * e.g. t('Đăng nhập'). English lives in ./en/*.ts (same keys). Interpolation: t('Buổi {{n}}', { n }).
 * The coverage test (i18n.test.ts) fails when a t('…') key has no English translation.
 */
const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  if (typeof navigator !== 'undefined' && !navigator.language?.toLowerCase().startsWith('vi')) return 'en';
  return 'vi';
}

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: {} }, en: { translation: { ...SHARED_EN, ...EN_DICTIONARY } } },
  lng: initialLang(),
  fallbackLng: 'vi',
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

export function currentLang(): Lang {
  return isLang(i18n.language) ? i18n.language : 'vi';
}

/** Changes the UI language (persisted locally; the profile is updated by the caller when signed in). */
export async function setLanguage(lang: Lang) {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** Marks a Vietnamese string kept in a constant as a translation key (translate it with t() when rendering). */
export const tk = <T extends string>(s: T) => s;

export const dateLocale = () => (currentLang() === 'en' ? 'en-GB' : 'vi-VN');

export default i18n;
