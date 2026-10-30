import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@classinteract/shared';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase';
import { setLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

/** VI / EN toggle. Saves the choice locally and in the user's profile when signed in. */
export function LanguageSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const change = async (lang: Lang) => {
    await setLanguage(lang);
    if (auth.currentUser) void api.patch('/auth/me', { language: lang }).catch(() => undefined);
  };
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 text-xs', className)} role="group" aria-label={t('Ngôn ngữ')}>
      {!compact && <Languages className="ml-1.5 h-3.5 w-3.5 text-muted" aria-hidden />}
      {(['vi', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => change(l)}
          aria-pressed={i18n.language === l}
          className={cn('rounded-md px-2 py-1 font-semibold', i18n.language === l ? 'bg-primary text-white' : 'text-muted hover:text-fg')}
        >
          {l === 'vi' ? 'VI' : 'EN'}
        </button>
      ))}
    </div>
  );
}
