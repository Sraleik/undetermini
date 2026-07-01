// TODO-PHASE-0B: this type import contaminates the engine with kalent
// subject-specific types. Fix: define a generic `Variant` shape owned by
// engine (eval/src/engine/types.ts), and let kalent's subject make its
// concrete `EvalVariant` assignable to it. See spec §"Known contaminations".
import type { EvalVariant } from '@eval/engine/variant';
import type { AxisInputs, SysPromptAxisValue } from './axis-inputs';
import {
  supportsReasoningEffort,
  supportsThinkingBudget,
} from './model-capabilities';
import { computeVariantName } from './variant-name';

/**
 * Expand an `AxisInputs` into the cartesian product of valid `EvalVariant` objects.
 *
 * Behavior:
 * - For each model, iterates over its provider-specific axis only (OpenAI → reasoningEfforts,
 *   Anthropic → thinkingBudgets). Cross-provider axis values are silently dropped.
 * - Combos that violate the capability matrix are silently skipped (e.g. `gpt-4.1` +
 *   `effort=medium` → dropped because gpt-4.1 doesn't support reasoning_effort; `opus-4-7`
 *   + `think=4096` → dropped because opus-4-7 rejects budget_tokens).
 * - Empty axes default to `['default']` so callers don't have to pass `['default']` explicitly
 *   for axes they don't care about.
 * - The function is pure: same input → same output, no side effects, no I/O.
 *
 * The produced variants are byte-equivalent to what you'd declare statically in
 * `subject.variants` — they hash to the same `variant_config_id` via `prepareVariantConfigs`.
 */
export const expandCartesian = (axes: AxisInputs): EvalVariant[] => {
  const reasoningEfforts =
    axes.reasoningEfforts.length === 0 ? ['default' as const] : axes.reasoningEfforts;
  const thinkingBudgets =
    axes.thinkingBudgets.length === 0 ? ['default' as const] : axes.thinkingBudgets;
  const sysPrompts: ReadonlyArray<SysPromptAxisValue> =
    axes.sysPrompts.length === 0 ? ['default'] : axes.sysPrompts;

  const variants: EvalVariant[] = [];
  const seenNames = new Set<string>();

  for (const model of axes.models) {
    for (const sysPrompt of sysPrompts) {
      const sysPromptName = sysPrompt === 'default' ? undefined : sysPrompt.name;
      const sysPromptText = sysPrompt === 'default' ? undefined : sysPrompt.text;

      if (model.provider === 'openai') {
        for (const effort of reasoningEfforts) {
          if (effort !== 'default' && !supportsReasoningEffort(model.modelId, effort)) {
            continue;
          }
          const reasoningEffort = effort === 'default' ? undefined : effort;
          const name = computeVariantName({
            modelId: model.modelId,
            reasoningEffort,
            sysPromptName,
          });
          if (seenNames.has(name)) continue;
          seenNames.add(name);
          variants.push({
            name,
            provider: 'openai',
            modelId: model.modelId,
            ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
            ...(sysPromptText !== undefined ? { systemPrompt: sysPromptText } : {}),
          });
        }
        continue;
      }

      for (const budget of thinkingBudgets) {
        if (budget !== 'default' && !supportsThinkingBudget(model.modelId)) continue;
        const thinkingBudgetTokens = budget === 'default' ? undefined : budget;
        const name = computeVariantName({
          modelId: model.modelId,
          thinkingBudgetTokens,
          sysPromptName,
        });
        if (seenNames.has(name)) continue;
        seenNames.add(name);
        variants.push({
          name,
          provider: 'anthropic',
          modelId: model.modelId,
          ...(thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens } : {}),
          ...(sysPromptText !== undefined ? { systemPrompt: sysPromptText } : {}),
        });
      }
    }
  }

  return variants;
};
