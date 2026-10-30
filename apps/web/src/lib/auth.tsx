import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserDoc } from '@classinteract/shared';
import { isLang } from '@classinteract/shared';
import i18n, { currentLang, setLanguage } from '@/i18n';
import { api } from './api';
import { auth, db } from './firebase';
import { queryClient } from './query';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: UserDoc | null;
  firebaseUser: User | null;
  login: (loginId: string, password: string) => Promise<UserDoc>;
  register: (studentId: string, password: string) => Promise<UserDoc>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, (fu) => {
      unsubProfile?.();
      unsubProfile = null;
      setFirebaseUser(fu);
      if (!fu) {
        setUser(null);
        setStatus('signedOut');
        queryClient.clear();
        return;
      }
      // Live profile: role/status changes apply immediately.
      unsubProfile = onSnapshot(
        doc(db, 'users', fu.uid),
        (snap) => {
          const u = snap.data() as UserDoc | undefined;
          if (!u || u.status !== 'active') {
            setUser(null);
            void signOut(auth);
            return;
          }
          const lang = (u as { language?: string }).language;
          if (isLang(lang) && lang !== i18n.language) void setLanguage(lang);
          setUser(u);
          setStatus('signedIn');
        },
        () => {
          setUser(null);
          void signOut(auth);
        },
      );
    });
    const onRevoked = () => void signOut(auth);
    window.addEventListener('ci:session-revoked', onRevoked);
    return () => {
      unsub();
      unsubProfile?.();
      window.removeEventListener('ci:session-revoked', onRevoked);
    };
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const r = await api.post<{ token: string; user: UserDoc }>('/auth/login', { loginId, password });
    await signInWithCustomToken(auth, r.token);
    return r.user;
  }, []);

  const register = useCallback(async (studentId: string, password: string) => {
    const r = await api.post<{ token: string; user: UserDoc }>('/auth/register', { studentId, password, language: currentLang() });
    await signInWithCustomToken(auth, r.token);
    return r.user;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const r = await api.post<{ token: string }>('/auth/change-password', { currentPassword, newPassword });
    await signInWithCustomToken(auth, r.token);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ status, user, firebaseUser, login, register, changePassword, logout }),
    [status, user, firebaseUser, login, register, changePassword, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Signed-in user (only use below a route guard). */
export function useMe(): UserDoc {
  const { user } = useAuth();
  if (!user) throw new Error('Not signed in');
  return user;
}
