import type { EvalVariant } from '@eval/engine/variant';
import { parseSysPromptName } from './components/VariantTable';

/**
 * Axis summary for the Confirm page, derived from the SELECTED variants (the
 * run's source of truth — it survives VariantsPage deselections, unlike the
 * raw `state.axes`). Born from the 2026-07-10 incident: a 5-model run left
 * with every schema on `default` because nothing on the confirm screen showed
 * which axis values were about to run.
 */
export type AxisRecap = {
  models: string[];
  sysPrompts: string[];
  schemas: string[];
  /** True when every variant runs the live prod schema — the exact shape of
   *  the incident this recap guards against. */
  schemasAllDefault: boolean;
};

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values)].sort();

const modelLabel = (variant: EvalVariant): string => {
  if (variant.provider === 'openai' && variant.reasoningEffort !== undefined) {
    return `${variant.modelId}(${variant.reasoningEffort})`;
  }
  if (
    variant.provider === 'anthropic' &&
    variant.thinkingBudgetTokens !== undefined
  ) {
    return `${variant.modelId}(think ${variant.thinkingBudgetTokens})`;
  }
  return variant.modelId;
};

export const summarizeAxes = (
  variants: ReadonlyArray<EvalVariant>,
): AxisRecap => {
  const schemas = uniqueSorted(
    variants.map((v) => v.extractionSchemaName ?? 'default'),
  );
  return {
    models: uniqueSorted(variants.map(modelLabel)),
    sysPrompts: uniqueSorted(
      variants.map((v) => parseSysPromptName(v.name) ?? 'default'),
    ),
    schemas,
    schemasAllDefault: schemas.length === 1 && schemas[0] === 'default',
  };
};
