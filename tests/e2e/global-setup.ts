import { execSync } from 'node:child_process';

/** Seeds demo accounts once (the seed script is a no-op if data already exists). */
export default function globalSetup() {
  execSync('pnpm --filter @classinteract/api seed', {
    cwd: new URL('../../', import.meta.url).pathname,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
    },
  });
}
