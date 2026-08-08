import type { ReasoningEffortValue } from './axis-inputs';

/**
 * Per-model declaration of which axes the API accepts.
 *
 * Sources (verified 2026-07-09):
 * - OpenAI: `reasoning_effort` is accepted only by reasoning models (o-series, gpt-5*).
 *   The gpt-4.1-* and gpt-4o-* families ignore it silently — we treat that as "not supported"
 *   to keep variants honest.
 *   https://developers.openai.com/api/docs/guides/reasoning
 *   Per-model effort sets: https://developers.openai.com/api/docs/models/<model-id>
 * - Anthropic: `thinking.budget_tokens` is accepted on Opus 4.6, Sonnet 4.6, Haiku 4.5.
 *   Claude Opus 4.7 REJECTS `budget_tokens` (adaptive thinking only).
 *   https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
 *
 * Re-verify monthly with provider release notes (same cadence as `eval/PRICING.md`).
 */

type ModelCapability = {
  provider: 'openai' | 'anthropic' | 'google';
  /** Reasoning effort values the model accepts. Absent = not a reasoning model. */
  reasoningEffort?: ReadonlyArray<ReasoningEffortValue>;
  /** When true, the eval axis value `minimal` is sent to the API as `none` (gpt-5.1+). */
  reasoningEffortMinimalMapsToNone?: boolean;
  /** Thinking support mode. `'budget'` = `budget_tokens` accepted, `'adaptive'` = rejects
   *  `budget_tokens` and uses adaptive thinking only. Absent = no thinking support. */
  thinking?: 'budget' | 'adaptive';
};

/** gpt-5 / gpt-5-mini / gpt-5-nano — API docs list minimal through high. */
const GPT5_REASONING_EFFORT = [
  'minimal',
  'low',
  'medium',
  'high',
] as const satisfies ReadonlyArray<ReasoningEffortValue>;

/** gpt-5.1+ frontier family — API docs list none/low/medium/high/xhigh; `minimal` maps to none. */
const GPT51_PLUS_REASONING_EFFORT = [
  'minimal',
  'low',
  'medium',
  'high',
] as const satisfies ReadonlyArray<ReasoningEffortValue>;

/** o-series mini models — low/medium/high only (no minimal/none). */
const O_MINI_REASONING_EFFORT = [
  'low',
  'medium',
  'high',
] as const satisfies ReadonlyArray<ReasoningEffortValue>;

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // OpenAI — non-reasoning families
  'gpt-4o': { provider: 'openai' },
  'gpt-4o-mini': { provider: 'openai' },
  'gpt-4.1': { provider: 'openai' },
  'gpt-4.1-mini': { provider: 'openai' },
  'gpt-4.1-nano': { provider: 'openai' },
  // OpenAI — gpt-5 reasoning family
  'gpt-5': {
    provider: 'openai',
    reasoningEffort: GPT5_REASONING_EFFORT,
  },
  'gpt-5-mini': {
    provider: 'openai',
    reasoningEffort: GPT5_REASONING_EFFORT,
  },
  'gpt-5-nano': {
    provider: 'openai',
    reasoningEffort: GPT5_REASONING_EFFORT,
  },
  'gpt-5-pro': {
    provider: 'openai',
    reasoningEffort: GPT5_REASONING_EFFORT,
  },
  // OpenAI — gpt-5.1 / gpt-5.2 reasoning family
  'gpt-5.1': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.2': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.2-pro': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  // OpenAI — gpt-5.4 reasoning family
  'gpt-5.4': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.4-mini': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.4-nano': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.4-pro': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  // OpenAI — gpt-5.5 reasoning family
  'gpt-5.5': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  'gpt-5.5-pro': {
    provider: 'openai',
    reasoningEffort: GPT51_PLUS_REASONING_EFFORT,
    reasoningEffortMinimalMapsToNone: true,
  },
  // OpenAI — o-series reasoning family
  'o1': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o1-pro': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o1-mini': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o3': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o3-pro': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o3-mini': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  'o4-mini': {
    provider: 'openai',
    reasoningEffort: O_MINI_REASONING_EFFORT,
  },
  // Anthropic — adaptive thinking only (rejects budget_tokens)
  'claude-opus-4-7': { provider: 'anthropic', thinking: 'adaptive' },
  // Anthropic — budget_tokens supported
  'claude-opus-4-6': { provider: 'anthropic', thinking: 'budget' },
  'claude-sonnet-4-6': { provider: 'anthropic', thinking: 'budget' },
  'claude-haiku-4-5': { provider: 'anthropic', thinking: 'budget' },
  // Anthropic — latest gen. Direct-key access verified 2026-07-09 (HTTP 200).
  // Thinking axis not yet characterized (budget vs adaptive) — provider default only.
  'claude-opus-4-8': { provider: 'anthropic' },
  'claude-sonnet-5': { provider: 'anthropic' },
  // Google — Vertex Express via GOOGLE_GENERATIVE_AI_API_KEY. No
  // reasoning/thinking axis wired: variants run with provider defaults, JSON
  // enforced by a cleaned responseSchema (structuredOutputs, no repair/retry).
  'gemini-3.5-flash': { provider: 'google' },
  'gemini-3.1-pro-preview': { provider: 'google' },
  'gemini-3-flash-preview': { provider: 'google' },
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

/** Map eval-axis `reasoningEffort` to the value the OpenAI API expects. */
export const toOpenAiReasoningEffort = (
  modelId: string,
  effort: ReasoningEffortValue,
) => {
  const capability = getCapability(modelId);
  if (
    effort === 'minimal' &&
    capability?.reasoningEffortMinimalMapsToNone === true
  ) {
    return 'none';
  }
  return effort;
};

export const knownModelIds = () => Object.keys(MODEL_CAPABILITIES);
