/**
 * Axis values that are not tied to a model: the system prompt and the extraction
 * schema. Each carries `'default'` as a distinguished value meaning "leave the
 * field unset on the produced variant" (the baseline applies at runtime).
 */

/** A system prompt axis value is either `'default'` (no override, baseline used at runtime)
 *  or an overridden prompt with a display name + the raw text injected into the variant. */
export type SysPromptAxisValue = 'default' | { name: string; text: string };

/** An extraction-schema axis value is either `'default'` (the live prod schema)
 *  or a registered schema referenced BY NAME — the zod object stays subject-side
 *  (resolved in `runOne` via `REGISTERED_SCHEMAS`), keeping the engine clean. */
export type SchemaAxisValue = 'default' | { name: string };
