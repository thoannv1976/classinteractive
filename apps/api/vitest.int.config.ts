import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      GCLOUD_PROJECT: 'demo-classinteract',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
      SETUP_TOKEN: 'test-setup-token',
      LOG_LEVEL: 'silent',
      AI_FAKE_PROVIDER: '1',
    },
  },
});
