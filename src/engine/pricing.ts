// USD per 1M tokens. Verification cadence + sources documented in eval/PRICING.md —
// re-fetch monthly.
export const PRICING_VERIFIED_AT = '2026-06-03';

export const PRICING_SOURCES = {
  openai: 'https://www.aipricing.guru/openai-pricing/',
  // OpenAI automatic prompt caching (≥1024-token prompts cache the static prefix;
  // cached input billed at the discounted `cachedInput` rate below).
  openaiPromptCaching:
    'https://developers.openai.com/api/docs/guides/prompt-caching',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
} as const;

export const MODEL_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number; cachedInput: number }
> = {
  // OpenAI — gpt-4.1 family is legacy but still active in API.
  // `cachedInput` = price of a cached-prefix input token (OpenAI prompt caching,
  // ~25% of input = 75% off for the gpt-4.1 / gpt-4o families).
  'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
  'gpt-4.1': { input: 2.0, output: 8.0, cachedInput: 0.5 },
  // Anthropic — Opus 4.5+ tier is $5/$25, NOT $15/$75 (legacy 4 / 4.1).
  // cache READ ≈ 0.1× input ($0.50); cache WRITE ≈ 1.25× input. We model the
  // cache-READ rate only (the eval is OpenAI-dominated — keep it simple).
  'claude-opus-4-7': { input: 5.0, output: 25.0, cachedInput: 0.5 },
  'claude-opus-4-6': { input: 5.0, output: 25.0, cachedInput: 0.5 },
};

/**
 * Cost of a single (input, output) token bill in USD, or null for an unknown model.
 *
 * `cachedInputTokens` (default 0) are the subset of `inTokens` served from the
 * provider's prompt cache: they are billed at the discounted `cachedInput` rate
 * instead of `input`. With the default 0, ALL existing callers are byte-behaviour
 * identical to the pre-cache implementation.
 *
 * Billing: `uncached = max(0, inTokens - cachedInputTokens)` at `input`;
 * `cachedInputTokens` at `cachedInput`; `outTokens` at `output`.
 */
export const computeCost = (
  modelId: string,
  inTokens: number,
  outTokens: number,
  cachedInputTokens = 0,
): number | null => {
  const p = MODEL_PRICING_USD_PER_1M[modelId];
  if (!p) return null;
  // Clamp: cachedInputTokens must never exceed inTokens (would charge negative
  // uncached tokens). Defensive against caller / provider inconsistencies.
  const uncached = Math.max(0, inTokens - cachedInputTokens);
  return (
    (uncached / 1_000_000) * p.input +
    (cachedInputTokens / 1_000_000) * p.cachedInput +
    (outTokens / 1_000_000) * p.output
  );
};
