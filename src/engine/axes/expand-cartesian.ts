// TODO-PHASE-0B: this type import contaminates the engine with kalent
// subject-specific types. Fix: define a generic `Variant` shape owned by
// engine (eval/src/engine/types.ts), and let kalent's subject make its
// concrete `EvalVariant` assignable to it. See spec §"Known contaminations".
import type { EvalVariant } from '@eval/engine/variant';
import type { AxisInputs, SchemaAxisValue, SysPromptAxisValue } from './axis-inputs';
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
/** A (model × axis-value) combo removed by the capability matrix. Surfaced on
 *  the TUI Variants page so a silently-vanishing model is visible instead of a
 *  mystery — 2026-07-10: gpt-4.1 × eff-minimal (only `minimal` checked, which
 *  gpt-4.1 does not support) erased the model from the run without a trace. */
export type DroppedCombo = {
  modelId: string;
  axis: 'eff' | 'think';
  value: string;
  reason: string;
};

export type CartesianExpansion = {
  variants: EvalVariant[];
  /** Capability-matrix skips only — one entry per (model, axis, value), never
   *  repeated across sysPrompt × schema turns. Cross-provider axis values
   *  (e.g. an effort meeting an Anthropic model) are NOT reported: the axis
   *  simply does not apply there, by design. */
  dropped: DroppedCombo[];
};

export const expandCartesianDetailed = (
  axes: AxisInputs,
): CartesianExpansion => {
  const reasoningEfforts =
    axes.reasoningEfforts.length === 0 ? ['default' as const] : axes.reasoningEfforts;
  const thinkingBudgets =
    axes.thinkingBudgets.length === 0 ? ['default' as const] : axes.thinkingBudgets;
  const sysPrompts: ReadonlyArray<SysPromptAxisValue> =
    axes.sysPrompts.length === 0 ? ['default'] : axes.sysPrompts;
  const schemas: ReadonlyArray<SchemaAxisValue> =
    axes.schemas === undefined || axes.schemas.length === 0
      ? ['default']
      : axes.schemas;

  const variants: EvalVariant[] = [];
  const seenNames = new Set<string>();
  const dropped: DroppedCombo[] = [];
  const seenDrops = new Set<string>();
  const recordDrop = (combo: DroppedCombo): void => {
    const key = `${combo.modelId}|${combo.axis}|${combo.value}`;
    if (seenDrops.has(key)) return;
    seenDrops.add(key);
    dropped.push(combo);
  };

  for (const model of axes.models) {
    for (const sysPrompt of sysPrompts) {
      const sysPromptName = sysPrompt === 'default' ? undefined : sysPrompt.name;
      const sysPromptText = sysPrompt === 'default' ? undefined : sysPrompt.text;

      for (const schema of schemas) {
        const schemaName = schema === 'default' ? undefined : schema.name;
        // The two provider-agnostic override fields, computed once per
        // (sysPrompt, schema) turn instead of re-spread in each branch.
        const axisOverrides = {
          ...(sysPromptText !== undefined ? { systemPrompt: sysPromptText } : {}),
          ...(schemaName !== undefined ? { extractionSchemaName: schemaName } : {}),
        };

        if (model.provider === 'openai') {
          for (const effort of reasoningEfforts) {
            if (effort !== 'default' && !supportsReasoningEffort(model.modelId, effort)) {
              recordDrop({
                modelId: model.modelId,
                axis: 'eff',
                value: effort,
                reason: 'model does not support reasoning_effort',
              });
              continue;
            }
            const reasoningEffort = effort === 'default' ? undefined : effort;
            const name = computeVariantName({
              modelId: model.modelId,
              reasoningEffort,
              sysPromptName,
              schemaName,
            });
            if (seenNames.has(name)) continue;
            seenNames.add(name);
            variants.push({
              name,
              provider: 'openai',
              modelId: model.modelId,
              ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
              ...axisOverrides,
            });
          }
          continue;
        }

        if (model.provider === 'google') {
          // No provider-specific axis wired for Google yet — one variant per
          // (model, sysPrompt, schema); reasoningEfforts / thinkingBudgets are dropped.
          const name = computeVariantName({
            modelId: model.modelId,
            sysPromptName,
            schemaName,
          });
          if (seenNames.has(name)) continue;
          seenNames.add(name);
          variants.push({
            name,
            provider: 'google',
            modelId: model.modelId,
            ...axisOverrides,
          });
          continue;
        }

        for (const budget of thinkingBudgets) {
          if (budget !== 'default' && !supportsThinkingBudget(model.modelId)) {
            recordDrop({
              modelId: model.modelId,
              axis: 'think',
              value: String(budget),
              reason: 'model does not support thinking budget_tokens',
            });
            continue;
          }
          const thinkingBudgetTokens = budget === 'default' ? undefined : budget;
          const name = computeVariantName({
            modelId: model.modelId,
            thinkingBudgetTokens,
            sysPromptName,
            schemaName,
          });
          if (seenNames.has(name)) continue;
          seenNames.add(name);
          variants.push({
            name,
            provider: 'anthropic',
            modelId: model.modelId,
            ...(thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens } : {}),
            ...axisOverrides,
          });
        }
      }
    }
  }

  return { variants, dropped };
};

export const expandCartesian = (axes: AxisInputs): EvalVariant[] =>
  expandCartesianDetailed(axes).variants;
