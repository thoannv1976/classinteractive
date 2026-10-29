import type { AiSettingsDoc } from '@classinteract/shared';
import { now } from '../../firebase';
import { C } from '../../lib/paths';

/** Model IDs are configuration, editable by admins in "Cấu hình AI" – never hard-coded in business logic. */
export const DEFAULT_AI_SETTINGS: AiSettingsDoc = {
  enabled: true,
  defaultProvider: 'anthropic',
  fallbackOrder: ['anthropic', 'openai', 'gemini'],
  providers: {
    anthropic: { enabled: true, model: 'claude-opus-5-5', inputCostPerMTok: 4, outputCostPerMTok: 20 },
    openai: { enabled: true, model: 'gpt-5-mini', inputCostPerMTok: 0.25, outputCostPerMTok: 2 },
    gemini: { enabled: true, model: 'gemini-2.5-flash', inputCostPerMTok: 0.3, outputCostPerMTok: 2.5 },
  },
  maxOutputTokens: 2000,
  timeoutMs: 45000,
  monthlyCostLimitUsd: 50,
};

export async function getAiSettings(): Promise<AiSettingsDoc> {
  const snap = await C.settings('ai').get();
  if (!snap.exists) return DEFAULT_AI_SETTINGS;
  const d = snap.data() as Partial<AiSettingsDoc>;
  return {
    ...DEFAULT_AI_SETTINGS,
    ...d,
    providers: { ...DEFAULT_AI_SETTINGS.providers, ...(d.providers ?? {}) },
  } as AiSettingsDoc;
}

export async function ensureAiSettings() {
  const ref = C.settings('ai');
  if (!(await ref.get()).exists) await ref.set({ ...DEFAULT_AI_SETTINGS, updatedAt: now() });
}
