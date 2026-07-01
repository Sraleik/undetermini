import type Database from 'better-sqlite3';
import { canonicalize, sha256 } from '@eval/engine/cache/hash';
import { openEvalDb } from './schema';

/** Canonicalised JSON string used as `provider_options_json` in variant_configs.
 *  Sorts keys recursively so the same logical object always produces the same
 *  string — required for stable content-addressing. */
export const canonicalizeProviderOptions = (
  options: Record<string, unknown> | null | undefined,
): string | null => {
  if (options === null || options === undefined) return null;
  return JSON.stringify(canonicalize(options));
};

/** Content-addressed id for system_prompts: sha256 of the prompt text. */
export const computeSystemPromptId = (text: string): string => sha256(text);

/** Content-addressed id for variant_configs. Hashes the canonicalised tuple
 *  (provider, model_id, system_prompt_id, provider_options_json). Two variants
 *  with byte-identical axes produce the same id and are deduplicated by the
 *  PK constraint on `variant_configs.id`. */
export const computeVariantConfigId = (input: {
  provider: string;
  modelId: string;
  systemPromptId: string;
  providerOptionsJson: string | null;
}): string =>
  sha256({
    provider: input.provider,
    modelId: input.modelId,
    systemPromptId: input.systemPromptId,
    providerOptionsJson: input.providerOptionsJson,
  });

type ConfigArgs<V> = {
  systemPrompt: string;
  variants: V[];
  buildProviderOptions: (variant: V) => Record<string, unknown> | undefined;
};

export type ResolvedVariantConfig = {
  configId: string;
  systemPromptId: string;
  effectivePrompt: string;
  providerOptionsJson: string | null;
};

/** Pure, side-effect-free resolution of each variant's content-addressed
 *  `variant_config_id` (+ the parts needed to persist it). Single source of the
 *  id computation: both `prepareVariantConfigs` (write path, at run time) and
 *  the TUI cost estimator (read path, at confirm time) go through this, so the
 *  estimate can never drift from the runtime cache key again. */
export const resolveVariantConfigIds = <
  V extends {
    name: string;
    provider: string;
    modelId: string;
    systemPrompt?: string;
  },
>(
  args: ConfigArgs<V>,
): Map<string, ResolvedVariantConfig> => {
  const out = new Map<string, ResolvedVariantConfig>();
  for (const variant of args.variants) {
    const effectivePrompt = variant.systemPrompt ?? args.systemPrompt;
    const systemPromptId = computeSystemPromptId(effectivePrompt);
    const providerOptionsJson = canonicalizeProviderOptions(
      args.buildProviderOptions(variant),
    );
    const configId = computeVariantConfigId({
      provider: variant.provider,
      modelId: variant.modelId,
      systemPromptId,
      providerOptionsJson,
    });
    out.set(variant.name, {
      configId,
      systemPromptId,
      effectivePrompt,
      providerOptionsJson,
    });
  }
  return out;
};

/** Pre-populate `system_prompts` and `variant_configs` for a subject's variants.
 *  Each variant's effective prompt is `variant.systemPrompt ?? args.systemPrompt`,
 *  hashed into its own row in `system_prompts` (INSERT OR IGNORE deduplicates).
 *  Returns a Map keyed by `variant.name` pointing at the content-addressed config id.
 *  The runner uses this map to stamp each `TrialContext` with the right config id. */
export const prepareVariantConfigs = <
  V extends {
    name: string;
    provider: string;
    modelId: string;
    systemPrompt?: string;
  },
>(
  args: ConfigArgs<V>,
  db: Database.Database = openEvalDb(),
): Map<string, string> => {
  const now = new Date().toISOString();
  const resolved = resolveVariantConfigIds(args);

  const insertPrompt = db.prepare(`
    INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at)
    VALUES (?, ?, ?)
  `);
  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO variant_configs (
      id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const configIds = new Map<string, string>();
  db.transaction(() => {
    for (const variant of args.variants) {
      const r = resolved.get(variant.name)!;
      insertPrompt.run(r.systemPromptId, r.effectivePrompt, now);
      insertConfig.run(
        r.configId,
        variant.provider,
        variant.modelId,
        r.systemPromptId,
        r.providerOptionsJson,
        now,
      );
      configIds.set(variant.name, r.configId);
    }
  })();
  return configIds;
};
