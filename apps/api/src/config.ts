import { DEFAULT_TENANT_ID } from '@classinteract/shared';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8081),
  host: env.HOST ?? '0.0.0.0',
  projectId: env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT ?? env.FIREBASE_PROJECT_ID ?? 'demo-classinteract',
  tenantId: env.TENANT_ID ?? DEFAULT_TENANT_ID,
  logLevel: env.LOG_LEVEL ?? 'info',
  setupToken: env.SETUP_TOKEN ?? '',
  corsOrigins: (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isEmulator: !!env.FIRESTORE_EMULATOR_HOST,
  ai: {
    openaiKey: env.OPENAI_API_KEY ?? '',
    anthropicKey: env.ANTHROPIC_API_KEY ?? '',
    geminiKey: env.GEMINI_API_KEY ?? '',
    fake: env.AI_FAKE_PROVIDER === '1',
  },
} as const;
