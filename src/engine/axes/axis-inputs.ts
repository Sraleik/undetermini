/**
 * Pure input types for the cartesian variant builder.
 *
 * `AxisInputs` is the canonical representation of "what the user wants to sweep" —
 * the TUI collects it interactively, the CLI parses it from flags, and `expandCartesian`
 * turns it into a deterministic list of `EvalVariant` objects.
 *
 * Design choices:
 * - Each axis carries `'default'` as a distinguished value meaning "leave the field unset
 *   on the produced variant" (and therefore fall back to the baseline at runtime).
 * - `models` carries `provider` alongside `modelId` so the cartesian can dispatch to the
 *   correct provider-specific axis (OpenAI → reasoningEffort, Anthropic → thinkingBudgetTokens)
 *   without consulting the capability matrix.
 */

/** Reasoning effort values accepted by `EvalVariant['openai'].reasoningEffort`.
 *  Keep in sync with the union in
 *  `core/search-engine/services/natural-language-filter.service.eval.ts:73`. */
export type ReasoningEffortValue = 'minimal' | 'low' | 'medium' | 'high';

export type AxisModelEntry = {
  provider: 'openai' | 'anthropic';
  modelId: string;
};

/** A system prompt axis value is either `'default'` (no override, baseline used at runtime)
 *  or an overridden prompt with a display name + the raw text injected into the variant. */
export type SysPromptAxisValue = 'default' | { name: string; text: string };

export type AxisInputs = {
  models: ReadonlyArray<AxisModelEntry>;
  reasoningEfforts: ReadonlyArray<ReasoningEffortValue | 'default'>;
  thinkingBudgets: ReadonlyArray<number | 'default'>;
  sysPrompts: ReadonlyArray<SysPromptAxisValue>;
};
