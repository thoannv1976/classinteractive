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
  /** UniGame Hub (LTI 1.3 via the Hub). Off unless LTI_ENABLED=true. */
  lti: {
    enabled: env.LTI_ENABLED === 'true',
    hubUrl: (env.LTI_HUB_URL ?? '').replace(/\/+$/, ''),
    gameId: env.LTI_GAME_ID ?? 'classinteractive',
    secret: env.LTI_GAME_SECRET ?? '',
    /** Hub tenant → this app's tenant, e.g. "aiedu2026=default;other=default". */
    tenantMap: parseTenantMap(env.LTI_TENANT_MAP ?? ''),
  },
} as const;

export function parseTenantMap(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(/[;,]/)) {
    const [hub, app] = pair.split('=').map((x) => x?.trim());
    if (hub && app) out[hub] = app;
  }
  return out;
}

if (config.lti.enabled && (!config.lti.hubUrl || !config.lti.secret || !Object.keys(config.lti.tenantMap).length)) {
  throw new Error('LTI_ENABLED=true requires LTI_HUB_URL, LTI_GAME_SECRET and LTI_TENANT_MAP');
}
