import type { FastifyRequest } from 'fastify';
import { isLang, type Lang } from '@classinteract/shared';

/** Response language: explicit x-lang header, else the signed-in user's preference, else Vietnamese. */
export function requestLang(req: FastifyRequest | null | undefined): Lang {
  const h = req?.headers['x-lang'];
  if (isLang(h)) return h;
  const u = req?.user?.language;
  return isLang(u) ? u : 'vi';
}

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
/** Rough language guess for free text (Vietnamese has distinctive diacritics). */
export const guessLang = (text: string): Lang => (VI_CHARS.test(text) ? 'vi' : 'en');
