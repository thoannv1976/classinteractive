import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { AiProvider } from '@classinteract/shared';
import { config } from '../config';
import { db, now } from '../firebase';

/**
 * AI provider keys. Production: Google Cloud Secret Manager (one secret per provider, a new
 * version per change). Emulator/dev: a server-only Firestore collection (never readable by clients).
 * Values are cached for 60 s per instance, so a new key reaches all instances within a minute.
 * Environment variables (set at deploy time) remain a fallback.
 */
export const SECRET_NAMES: Record<AiProvider, string> = {
  anthropic: 'anthropic-api-key',
  openai: 'openai-api-key',
  gemini: 'gemini-api-key',
};
const ENV_FALLBACK: Record<AiProvider, () => string> = {
  anthropic: () => config.ai.anthropicKey,
  openai: () => config.ai.openaiKey,
  gemini: () => config.ai.geminiKey,
};

const useSecretManager = !config.isEmulator && process.env.SECRET_STORE !== 'firestore';
let client: SecretManagerServiceClient | null = null;
const sm = () => (client ??= new SecretManagerServiceClient());
const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 60_000;

async function readStore(name: string): Promise<string> {
  if (useSecretManager) {
    try {
      const [v] = await sm().accessSecretVersion({ name: `projects/${config.projectId}/secrets/${name}/versions/latest` });
      return v.payload?.data ? Buffer.from(v.payload.data as Uint8Array).toString('utf8').trim() : '';
    } catch {
      return ''; // secret missing, no versions yet, or no permission
    }
  }
  const snap = await db.collection('serverSecrets').doc(name).get();
  return ((snap.data()?.value as string | undefined) ?? '').trim();
}

export async function getProviderKey(provider: AiProvider): Promise<string> {
  const name = SECRET_NAMES[provider];
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (await readStore(name)) || ENV_FALLBACK[provider]();
  cache.set(name, { value, at: Date.now() });
  return value;
}

/** Stores a new key ('' removes it). Only non-secret metadata (last 4 chars) is kept in Firestore. */
export async function setProviderKey(provider: AiProvider, value: string, actorUid: string) {
  const name = SECRET_NAMES[provider];
  if (useSecretManager) {
    const parent = `projects/${config.projectId}/secrets/${name}`;
    // An empty version means "no key" (destroying versions needs broader permissions).
    const payload = { data: Buffer.from(value || ' ', 'utf8') };
    try {
      await sm().addSecretVersion({ parent, payload });
    } catch (e) {
      if ((e as { code?: number }).code !== 5) throw e; // 5 = NOT_FOUND: secret not created yet
      await sm().createSecret({ parent: `projects/${config.projectId}`, secretId: name, secret: { replication: { automatic: {} } } });
      await sm().addSecretVersion({ parent, payload });
    }
  } else {
    await db.collection('serverSecrets').doc(name).set({ value, updatedAt: now() });
  }
  cache.set(name, { value, at: Date.now() });
  await db
    .collection('systemSettings')
    .doc('aiKeys')
    .set({ [provider]: value ? { last4: value.slice(-4), updatedAt: now(), updatedBy: actorUid } : null }, { merge: true });
}

export interface KeyStatus {
  provider: AiProvider;
  configured: boolean;
  source: 'store' | 'env' | 'none';
  last4: string | null;
  updatedAt: unknown;
}

export async function keyStatuses(): Promise<KeyStatus[]> {
  const meta = (await db.collection('systemSettings').doc('aiKeys').get()).data() ?? {};
  return Promise.all(
    (Object.keys(SECRET_NAMES) as AiProvider[]).map(async (p) => {
      const stored = await readStore(SECRET_NAMES[p]);
      const env = ENV_FALLBACK[p]();
      const value = stored || env;
      return {
        provider: p,
        configured: !!value,
        source: stored ? 'store' : env ? 'env' : 'none',
        last4: value ? value.slice(-4) : null,
        updatedAt: stored ? (meta[p]?.updatedAt ?? null) : null,
      } satisfies KeyStatus;
    }),
  );
}
