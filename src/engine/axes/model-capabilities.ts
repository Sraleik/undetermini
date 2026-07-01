import type { ReasoningEffortValue } from './axis-inputs';

/**
 * Per-model declaration of which axes the API accepts.
 *
 * Sources (verified 2026-05-11):
 * - OpenAI: `reasoning_effort` is accepted only by reasoning models (o-series, gpt-5*).
 *   The gpt-4.1-* and gpt-4o-* families ignore it silently — we treat that as "not supported"
 *   to keep variants honest.
 *   https://developers.openai.com/api/docs/guides/reasoning
 * - Anthropic: `thinking.budget_tokens` is accepted on Opus 4.6, Sonnet 4.6, Haiku 4.5.
 *   Claude Opus 4.7 REJECTS `budget_tokens` (adaptive thinking only).
 *   https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
 *
 * Re-verify monthly with provider release notes (same cadence as `eval/PRICING.md`).
 */

type ModelCapability = {
  provider: 'openai' | 'anthropic';
  /** Reasoning effort values the model accepts. Absent = not a reasoning model. */
  reasoningEffort?: ReadonlyArray<ReasoningEffortValue>;
  /** Thinking support mode. `'budget'` = `budget_tokens` accepted, `'adaptive'` = rejects
   *  `budget_tokens` and uses adaptive thinking only. Absent = no thinking support. */
  thinking?: 'budget' | 'adaptive';
};

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // OpenAI — non-reasoning families
  'gpt-4o-mini': { provider: 'openai' },
  'gpt-4.1': { provider: 'openai' },
  'gpt-4.1-mini': { provider: 'openai' },
  'gpt-4.1-nano': { provider: 'openai' },
  // OpenAI — reasoning families
  'gpt-5': {
    provider: 'openai',
    reasoningEffort: ['minimal', 'low', 'medium', 'high'],
  },
  'gpt-5-mini': {
    provider: 'openai',
    reasoningEffort: ['minimal', 'low', 'medium', 'high'],
  },
  'gpt-5-nano': {
    provider: 'openai',
    reasoningEffort: ['minimal', 'low', 'medium', 'high'],
  },
  'o4-mini': {
    provider: 'openai',
    reasoningEffort: ['low', 'medium', 'high'],
  },
  // Anthropic — adaptive thinking only (rejects budget_tokens)
  'claude-opus-4-7': { provider: 'anthropic', thinking: 'adaptive' },
  // Anthropic — budget_tokens supported
  'claude-opus-4-6': { provider: 'anthropic', thinking: 'budget' },
  'claude-sonnet-4-6': { provider: 'anthropic', thinking: 'budget' },
  'claude-haiku-4-5': { provider: 'anthropic', thinking: 'budget' },
};

const getCapability = (modelId: string): ModelCapability | undefined =>
  MODEL_CAPABILITIES[modelId];

export const getProvider = (modelId: string) => getCapability(modelId)?.provider;

export const supportsReasoningEffort = (
  modelId: string,
  effort: ReasoningEffortValue,
) => getCapability(modelId)?.reasoningEffort?.includes(effort) ?? false;

export const supportsThinkingBudget = (modelId: string) =>
  getCapability(modelId)?.thinking === 'budget';

export const knownModelIds = () => Object.keys(MODEL_CAPABILITIES);
