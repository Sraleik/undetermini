/**
 * `EvalVariant` — the generic descriptor of a single LLM call configuration
 * that the eval harness runs and compares.
 *
 * This type is subject-agnostic: it names a provider, a model, and the
 * provider-specific reasoning knob (OpenAI `reasoning_effort` vs Anthropic
 * `thinking.budget_tokens`). The discriminated union prevents mixing the two
 * across providers. An optional `systemPrompt` override is hashed into the
 * variant's `variant_config_id` and used at call time instead of the subject
 * default.
 *
 * It previously lived inside the kalent NL-filter subject; it is generic, so it
 * belongs in the engine. Subjects and clients import it from here.
 */
export type EvalVariant =
  | {
      name: string;
      provider: 'openai';
      modelId: string;
      /** OpenAI o-series and gpt-5 honour reasoning_effort. The gpt-4.1-* and
       *  gpt-4o-* families ignore it silently — leave undefined for these. */
      reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
      /** Optional override of the subject's default system prompt. When set, it
       *  is hashed into the variant's `variant_config_id` and used at call time. */
      systemPrompt?: string;
    }
  | {
      name: string;
      provider: 'anthropic';
      modelId: string;
      /** Opus 4.6/4.7 support extended thinking via thinking.budget_tokens.
       *  Absent = feature OFF (response without thinking block). */
      thinkingBudgetTokens?: number;
      /** Optional override of the subject's default system prompt. See OpenAI branch. */
      systemPrompt?: string;
    };
