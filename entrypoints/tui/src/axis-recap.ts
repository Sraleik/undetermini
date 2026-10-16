import type { ModelVariant } from '@undetermini/core/models/variant';
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

const modelLabel = (variant: ModelVariant): string =>
  variant.settingName === undefined
    ? variant.modelId
    : `${variant.modelId}(${variant.settingName})`;

export const summarizeAxes = (
  variants: ReadonlyArray<ModelVariant>,
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
