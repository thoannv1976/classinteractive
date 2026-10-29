import type { AiProvider } from '@classinteract/shared';

export interface StructuredRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  /** JSON schema of the expected output object. */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface StructuredResult {
  json: unknown;
  model: string;
  usage: { input: number; output: number };
}

/** Normalised interface – business logic never depends on a specific vendor API. */
export interface AiAdapter {
  provider: AiProvider;
  isConfigured(): boolean;
  generateStructured(req: StructuredRequest): Promise<StructuredResult>;
}

export class AiProviderError extends Error {
  constructor(
    public provider: AiProvider,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}
