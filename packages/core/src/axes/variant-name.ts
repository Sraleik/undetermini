/**
 * Compute the deterministic display name for a variant from its axis values.
 *
 * Convention (spec §6):
 *   <modelId>[__<settingName>][__sys-<value>][__sch-<value>]
 *
 * - Segments appear only when non-default (i.e. the corresponding axis field is set).
 * - Order is fixed: model → setting → sys → sch.
 * - Separator is `__` (double underscore) to disambiguate from `-` already present in
 *   modelIds (`gpt-4.1-mini`, `claude-opus-4-6`).
 *
 * This name is for display, sort, and CLI filtering. It is NOT the variant's identity —
 * that role belongs to `variant_configs.id` (content-addressed sha256 of the canonical
 * tuple, see `eval/storage/variant-config-id.ts:22`).
 */
export const computeVariantName = (input: {
  modelId: string;
  settingName?: string;
  sysPromptName?: string;
  schemaName?: string;
}) => {
  const segments = [input.modelId];
  if (input.settingName !== undefined) segments.push(input.settingName);
  if (input.sysPromptName !== undefined) segments.push(`sys-${input.sysPromptName}`);
  if (input.schemaName !== undefined) segments.push(`sch-${input.schemaName}`);
  return segments.join('__');
};
