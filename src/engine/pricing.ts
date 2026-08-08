// USD per 1M tokens. Verification cadence + sources documented in eval/PRICING.md —
// re-fetch monthly.
export const PRICING_VERIFIED_AT = '2026-07-09';

export const PRICING_SOURCES = {
  openai: 'https://developers.openai.com/api/docs/pricing',
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
  // OpenAI — gpt-4o / gpt-4.1 families. Verified 2026-07-09 (developers.openai.com/api/docs/pricing).
  // `cachedInput` = price of a cached-prefix input token (OpenAI prompt caching).
  'gpt-4o': { input: 2.5, output: 10.0, cachedInput: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
  'gpt-4.1': { input: 2.0, output: 8.0, cachedInput: 0.5 },
  // OpenAI gpt-5 family (reasoning).
  'gpt-5': { input: 1.25, output: 10.0, cachedInput: 0.125 },
  'gpt-5-mini': { input: 0.25, output: 2.0, cachedInput: 0.025 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cachedInput: 0.005 },
  // Pro tier — no published cache-read discount; cachedInput = input (no discount modeled).
  'gpt-5-pro': { input: 15.0, output: 120.0, cachedInput: 15.0 },
  // OpenAI gpt-5.1 / gpt-5.2 family (reasoning).
  'gpt-5.1': { input: 1.25, output: 10.0, cachedInput: 0.125 },
  'gpt-5.2': { input: 1.75, output: 14.0, cachedInput: 0.175 },
  'gpt-5.2-pro': { input: 21.0, output: 168.0, cachedInput: 21.0 },
  // OpenAI gpt-5.4 family (reasoning).
  'gpt-5.4': { input: 2.5, output: 15.0, cachedInput: 0.25 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5, cachedInput: 0.075 },
  'gpt-5.4-nano': { input: 0.2, output: 1.25, cachedInput: 0.02 },
  'gpt-5.4-pro': { input: 30.0, output: 180.0, cachedInput: 30.0 },
  // OpenAI gpt-5.5 family (reasoning).
  'gpt-5.5': { input: 5.0, output: 30.0, cachedInput: 0.5 },
  'gpt-5.5-pro': { input: 30.0, output: 180.0, cachedInput: 30.0 },
  // OpenAI o-series (reasoning).
  'o1': { input: 15.0, output: 60.0, cachedInput: 7.5 },
  'o1-pro': { input: 150.0, output: 600.0, cachedInput: 150.0 },
  'o1-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
  'o3': { input: 2.0, output: 8.0, cachedInput: 0.5 },
  'o3-pro': { input: 20.0, output: 80.0, cachedInput: 20.0 },
  'o3-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
  'o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
  // Anthropic — Opus 4.5+ tier is $5/$25, NOT $15/$75 (legacy 4 / 4.1).
  // cache READ ≈ 0.1× input ($0.50); cache WRITE ≈ 1.25× input. We model the
  // cache-READ rate only (the eval is OpenAI-dominated — keep it simple).
  'claude-opus-4-7': { input: 5.0, output: 25.0, cachedInput: 0.5 },
  'claude-opus-4-6': { input: 5.0, output: 25.0, cachedInput: 0.5 },
  // Opus 4.8 same tier as 4.7 ($5/$25). Sonnet 5 $3/$15 (intro $2/$10 until
  // 2026-08-31 — using standard rate). Verified 2026-07-09 (claude-api skill).
  'claude-opus-4-8': { input: 5.0, output: 25.0, cachedInput: 0.5 },
  'claude-sonnet-5': { input: 3.0, output: 15.0, cachedInput: 0.3 },
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
