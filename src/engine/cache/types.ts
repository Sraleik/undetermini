import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';

/**
 * - `'auto'` — lookup latest successful trial for the cache key; on miss, INSERT.
 * - `'write-only'` — skip lookup, always INSERT a fresh row. Subsequent `'auto'`
 *   runs see the new row (most recent by `created_at`).
 *
 * The middleware always writes; only lookup behavior is mode-controlled.
 */
export type CacheMode = 'auto' | 'write-only';

export type CacheKey = {
  modelId: string;
  systemPromptSha: string;
  schemaSha: string;
  paramsSha: string;
  promptSha: string;
  staticHash: string;
  trialIndex: number;
};

export type CacheMetadata = {
  createdAt: string;
  latencyMs: number;
};

/** Runtime in-memory shape returned by lookup / handed to write. The DB row in
 *  `trials` plus the LLM result. `trialId` is the UUID PRIMARY KEY of that row. */
export type CacheEntry = {
  trialId: string;
  key: CacheKey;
  metadata: CacheMetadata;
  response: LanguageModelV3GenerateResult;
};
