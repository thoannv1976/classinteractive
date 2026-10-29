import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Vietnamese is the source language: UI strings are written in Vietnamese and used as keys.
 * Add translations to `en` to enable English (see docs/I18N.md).
 */
const en: Record<string, string> = {
  'Đăng nhập': 'Sign in',
  'Đăng ký': 'Register',
  'Đăng xuất': 'Sign out',
  'Mật khẩu': 'Password',
  'Trang chủ': 'Home',
  'Lớp học': 'Classes',
  'Thông báo': 'Notifications',
  'Hồ sơ': 'Profile',
};

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: {} }, en: { translation: en } },
  lng: (typeof localStorage !== 'undefined' && safeGet('lang')) || 'vi',
  fallbackLng: 'vi',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export default i18n;
