import { signInWithCustomToken, signOut } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Alert, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { auth } from '@/lib/firebase';
import { queryClient } from '@/lib/query';
import { AuthLayout } from '@/features/auth/AuthLayout';

/**
 * Entry point for launches from the LMS through UniGame Hub (LTI 1.3).
 * The Hub sends the browser here with a one-time ticket in the URL fragment (#ticket=…).
 */
export function LtiLaunchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const started = useRef(false); // StrictMode runs effects twice; the ticket is single use.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const m = /(?:^#|&)ticket=([^&]+)/.exec(window.location.hash);
    // Remove the ticket from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!m) {
      setError(t('Không tìm thấy thông tin đăng nhập từ LMS. Hãy mở lại hoạt động trong Moodle.'));
      return;
    }
    void (async () => {
      try {
        const r = await api.post<{ token: string; redirect: string }>('/lti/launch', { ticket: decodeURIComponent(m[1]!) });
        if (auth.currentUser) await signOut(auth); // another account may be signed in on this browser
        queryClient.clear();
        await signInWithCustomToken(auth, r.token);
        navigate(r.redirect, { replace: true });
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [navigate, t]);

  return (
    <AuthLayout title={t('Đăng nhập từ Moodle')} subtitle={t('Đang mở ClassInteract bằng tài khoản LMS của bạn')}>
      {error ? (
        <Alert tone="danger" title={t('Không mở được ClassInteract')}>
          {error}
        </Alert>
      ) : (
        <div className="flex items-center gap-3 text-muted">
          <Spinner />
          <span>{t('Đang đăng nhập…')}</span>
        </div>
      )}
    </AuthLayout>
  );
}
