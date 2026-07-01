import type { ReasoningEffortValue } from './axis-inputs';

/**
 * Compute the deterministic display name for a variant from its axis values.
 *
 * Convention (spec §6):
 *   <modelId>[__eff-<value>][__think-<value>][__sys-<value>]
 *
 * - Segments appear only when non-default (i.e. the corresponding axis field is set).
 * - Order is fixed: model → provider-tuning → sys.
 * - Separator is `__` (double underscore) to disambiguate from `-` already present in
 *   modelIds (`gpt-4.1-mini`, `claude-opus-4-6`).
 *
 * This name is for display, sort, and CLI filtering. It is NOT the variant's identity —
 * that role belongs to `variant_configs.id` (content-addressed sha256 of the canonical
 * tuple, see `eval/storage/variant-config-id.ts:22`).
 */
export const computeVariantName = (input: {
  modelId: string;
  reasoningEffort?: ReasoningEffortValue;
  thinkingBudgetTokens?: number;
  sysPromptName?: string;
}) => {
  const segments = [input.modelId];
  if (input.reasoningEffort !== undefined) segments.push(`eff-${input.reasoningEffort}`);
  if (input.thinkingBudgetTokens !== undefined)
    segments.push(`think-${input.thinkingBudgetTokens}`);
  if (input.sysPromptName !== undefined) segments.push(`sys-${input.sysPromptName}`);
  return segments.join('__');
};
