import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the Firebase Emulator Suite (started by `pnpm test:e2e`
 * via `firebase emulators:exec`). API and web dev servers are started here, or
 * reused if already running (scripts/dev-stack.sh).
 */
const root = new URL('../../', import.meta.url).pathname;
const env = {
  GCLOUD_PROJECT: 'demo-classinteract',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
  SETUP_TOKEN: 'local-setup-token',
  AI_FAKE_PROVIDER: '1',
  LOG_LEVEL: 'warn',
  PORT: '8081',
};

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: { baseURL: 'http://localhost:5173', locale: 'vi-VN', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    { command: 'pnpm --filter @classinteract/api exec tsx src/index.ts', cwd: root, url: 'http://127.0.0.1:8081/healthz', env, reuseExistingServer: true, timeout: 60_000 },
    { command: 'pnpm --filter @classinteract/web exec vite --port 5173 --strictPort', cwd: root, url: 'http://localhost:5173', reuseExistingServer: true, timeout: 90_000 },
  ],
});
