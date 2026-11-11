import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import i18n from '@/i18n';

/** How often an open tab asks the server whether a new version was deployed. */
const CHECK_EVERY_MS = 15 * 60 * 1000;
/** A new version that arrives this soon after opening, before anything was typed, is applied at once. */
const QUIET_START_MS = 15 * 1000;
const CHUNK_RELOAD_KEY = 'app:chunk-reload-at';

let started = false;
let updateReady = false;

const reload = () => window.location.reload();

/**
 * Watches for a newly deployed version. The service worker installs it in the background
 * (skipWaiting + clientsClaim), but the open page keeps running the old code until it reloads.
 * We reload only at safe moments: right after opening (nothing typed yet), on the next page change,
 * or when the user clicks "Reload". Never while someone may be typing an answer.
 */
function startWatching() {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Old pages may ask for code files that the new deploy removed: reload once to get the new ones.
  window.addEventListener('vite:preloadError', (e) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    if (Date.now() - last < 10_000) return; // already tried: let the error show instead of looping
    e.preventDefault();
    reload();
  });

  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const openedAt = Date.now();
  let typed = false;
  document.addEventListener(
    'input',
    () => {
      typed = true;
    },
    { capture: true, once: true },
  );

  // No controller yet = first visit; the page already runs the current version.
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    if (!typed && Date.now() - openedAt < QUIET_START_MS) return reload();
    toast(i18n.t('Đã có phiên bản mới của ứng dụng.'), {
      id: 'app-update',
      duration: Infinity,
      action: { label: i18n.t('Tải lại'), onClick: reload },
    });
  });

  // A single-page app rarely reloads, so ask for updates while it stays open.
  const check = () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    void sw
      .getRegistration()
      .then((r) => r?.update())
      .catch(() => undefined);
  };
  window.setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', check);
}

/** Keeps open tabs on the latest deployed version (see startWatching). */
export function AppUpdater() {
  const location = useLocation();
  const path = location.pathname + location.search;
  const lastPath = useRef(path);

  useEffect(startWatching, []);

  // Changing page is a safe moment: whatever was on the old page is left anyway.
  useEffect(() => {
    if (path === lastPath.current) return;
    lastPath.current = path;
    if (updateReady) reload();
  }, [path]);

  return null;
}
