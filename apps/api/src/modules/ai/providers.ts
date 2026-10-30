import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { AiProvider } from '@classinteract/shared';
import { config } from '../../config';
import { getProviderKey } from '../../lib/secrets';
import { type AiAdapter, AiProviderError, type StructuredRequest, type StructuredResult } from './types';

function parseJson(provider: AiProvider, text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fallthrough */
      }
    }
    throw new AiProviderError(provider, 'Kết quả AI không đúng định dạng JSON', true);
  }
}

const isRetryableStatus = (s?: number) => !s || s === 408 || s === 409 || s === 429 || s >= 500;

// ---------- Anthropic Claude (Messages API) ----------
const clients = new Map<string, unknown>();
/** One SDK client per (provider, key); a key change creates a new client. */
function clientFor<T>(provider: AiProvider, key: string, make: () => T): T {
  const id = `${provider}:${key}`;
  if (!clients.has(id)) clients.set(id, make());
  return clients.get(id) as T;
}

async function requireKey(provider: AiProvider) {
  const key = await getProviderKey(provider);
  if (!key) throw new AiProviderError(provider, 'Chưa có API key', false);
  return key;
}

export const anthropicAdapter: AiAdapter = {
  provider: 'anthropic',
  isConfigured: async () => !!(await getProviderKey('anthropic')),
  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const key = await requireKey('anthropic');
    const anthropicClient = clientFor('anthropic', key, () => new Anthropic({ apiKey: key, maxRetries: 1 }));
    try {
      const res = await anthropicClient.beta.messages.create(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } },
          // Server-side fallback when the requested model declines for policy reasons.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { timeout: req.timeoutMs },
      );
      if (res.stop_reason === 'refusal') {
        throw new AiProviderError('anthropic', 'Mô hình từ chối trả lời câu hỏi này', false);
      }
      if (res.stop_reason === 'max_tokens') {
        throw new AiProviderError('anthropic', 'Câu trả lời AI bị cắt do vượt giới hạn token', false);
      }
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return {
        json: parseJson('anthropic', text),
        model: res.model,
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      };
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      if (e instanceof Anthropic.APIError) {
        throw new AiProviderError('anthropic', `Claude API lỗi ${e.status ?? ''}: ${e.message}`, isRetryableStatus(e.status));
      }
      throw new AiProviderError('anthropic', (e as Error).message, true);
    }
  },
};

// ---------- OpenAI (Responses API) ----------
export const openaiAdapter: AiAdapter = {
  provider: 'openai',
  isConfigured: async () => !!(await getProviderKey('openai')),
  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const key = await requireKey('openai');
    const openaiClient = clientFor('openai', key, () => new OpenAI({ apiKey: key, maxRetries: 1 }));
    try {
      const res = await openaiClient.responses.create(
        {
          model: req.model,
          instructions: req.system,
          input: req.user,
          max_output_tokens: req.maxOutputTokens,
          text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
        },
        { timeout: req.timeoutMs },
      );
      if (res.status === 'incomplete') {
        throw new AiProviderError('openai', `Phản hồi OpenAI chưa hoàn tất: ${res.incomplete_details?.reason ?? ''}`, false);
      }
      return {
        json: parseJson('openai', res.output_text),
        model: res.model,
        usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 },
      };
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      if (e instanceof OpenAI.APIError) {
        throw new AiProviderError('openai', `OpenAI API lỗi ${e.status ?? ''}: ${e.message}`, isRetryableStatus(e.status));
      }
      throw new AiProviderError('openai', (e as Error).message, true);
    }
  },
};

// ---------- Google Gemini (@google/genai) ----------
export const geminiAdapter: AiAdapter = {
  provider: 'gemini',
  isConfigured: async () => !!(await getProviderKey('gemini')),
  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const key = await requireKey('gemini');
    const geminiClient = clientFor('gemini', key, () => new GoogleGenAI({ apiKey: key }));
    try {
      const res = await geminiClient.models.generateContent({
        model: req.model,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: req.schema,
          httpOptions: { timeout: req.timeoutMs },
        },
      });
      const text = res.text ?? '';
      if (!text) throw new AiProviderError('gemini', 'Gemini không trả về nội dung', true);
      return {
        json: parseJson('gemini', text),
        model: res.modelVersion ?? req.model,
        usage: { input: res.usageMetadata?.promptTokenCount ?? 0, output: res.usageMetadata?.candidatesTokenCount ?? 0 },
      };
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      const status = (e as { status?: number }).status;
      throw new AiProviderError('gemini', `Gemini API lỗi ${status ?? ''}: ${(e as Error).message}`, isRetryableStatus(status));
    }
  },
};

/** Deterministic provider for tests and demos (AI_FAKE_PROVIDER=1). Output follows each task schema. */
export const fakeAdapter = (provider: AiProvider): AiAdapter => ({
  provider,
  isConfigured: async () => true,
  async generateStructured(req) {
    if (req.user.includes('[[FAIL]]')) throw new AiProviderError(provider, 'Fake provider failure', true);
    return { json: fakeOutput(provider, req), model: `${req.model}-fake`, usage: { input: 100, output: 50 } };
  },
});

function fakeOutput(provider: AiProvider, req: StructuredRequest): unknown {
  const ids = [...req.user.matchAll(/\[([A-Za-z0-9_-]{6,})\]/g)].map((m) => m[1]!);
  switch (req.schemaName) {
    case 'topic_classification': {
      const topics = [...req.user.matchAll(/^- ([^:\n]+)/gm)].map((m) => m[1]!.trim());
      const lines = [...req.user.matchAll(/^\[([^\]]+)\] (.*)$/gm)];
      const items = lines.map((m) => {
        const text = m[2]!.toLowerCase();
        const hit = topics.filter((t) => t.toLowerCase().split(/\s+/).some((w) => w.length > 3 && text.includes(w)));
        return { id: m[1]!, topics: hit.length ? hit.slice(0, 2) : topics.length ? [] : ['Chủ đề chung'] };
      });
      return { items, newTopics: topics.length ? [] : [{ name: 'Chủ đề chung', description: 'Fake' }] };
    }
    case 'cluster_names': {
      const groups = [...req.user.matchAll(/Nhóm (\d+): ids=([^\n]+)/g)];
      return { clusters: groups.map((g) => ({ name: `Vấn đề ${g[1]}`, description: 'Nhóm câu hỏi gần nghĩa (mô phỏng).', ids: g[2]!.split(',') })) };
    }
    case 'question_clusters':
      return { clusters: ids.length >= 2 ? [{ name: 'Vấn đề chung', description: 'Mô phỏng', ids: ids.slice(0, Math.min(ids.length, 3)) }] : [] };
    case 'session_summary': {
      const it = (text: string) => [{ text, refs: ids.slice(0, 2) }];
      return {
        mainContent: 'Nội dung chính của buổi học (mô phỏng).',
        topicsDiscussed: it('Chủ đề đã thảo luận'),
        keyQuestions: it('Câu hỏi quan trọng'),
        confirmedAnswers: it('Câu trả lời đã xác nhận'),
        unresolved: it('Vấn đề chưa giải đáp'),
        difficulties: it('Nội dung khó'),
        popular: it('Nội dung được quan tâm'),
        nextSession: [{ text: 'Ôn lại khái niệm chính', refs: ['not-a-real-id'] }],
      };
    }
    case 'activity_summary':
      return { overview: 'Tổng hợp mô phỏng.', themes: [{ title: 'Ý chính', detail: 'Chi tiết', count: 1 }], difficulties: ['Khó khăn mô phỏng'], suggestions: ['Gợi ý'] };
    case 'teaching_insights':
      return {
        insights: [{ category: 'unanswered', title: 'Còn câu hỏi chưa trả lời', detail: 'Mô phỏng', evidence: ['1 câu hỏi'], refs: ids.slice(0, 1) }],
        followUpQuestions: ['Câu hỏi tiếp nối mô phỏng?'],
      };
    case 'health_check':
      return { ok: true };
    default:
      return {
        shortAnswer: `(${provider}) Câu trả lời gợi ý ngắn gọn.`,
        explanation: 'Giải thích chi tiết do mô phỏng AI tạo ra để kiểm thử.',
        example: 'Ví dụ minh họa.',
        relatedConcepts: ['Khái niệm A', 'Khái niệm B'],
      };
  }
}

export function getAdapter(provider: AiProvider): AiAdapter {
  if (config.ai.fake) return fakeAdapter(provider);
  return provider === 'anthropic' ? anthropicAdapter : provider === 'openai' ? openaiAdapter : geminiAdapter;
}

// ---------- Embeddings (semantic similarity). Claude has no embedding API. ----------
export async function embedTexts(provider: 'openai' | 'gemini', model: string, texts: string[]): Promise<number[][]> {
  if (config.ai.fake) return texts.map(fakeEmbedding);
  const key = await requireKey(provider);
  if (provider === 'openai') {
    const client = clientFor('openai', key, () => new OpenAI({ apiKey: key, maxRetries: 1 }));
    const res = await client.embeddings.create({ model, input: texts });
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
  const client = clientFor('gemini', key, () => new GoogleGenAI({ apiKey: key }));
  const res = await client.models.embedContent({ model, contents: texts });
  return (res.embeddings ?? []).map((e) => e.values ?? []);
}

/** Deterministic bag-of-words vector for tests and demos (accent-insensitive). */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(256).fill(0);
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  for (const w of words) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 256]! += 1;
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
