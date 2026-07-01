/**
 * One-shot migration : backfills `system_prompts` and `variant_configs` from
 * existing `runs` + `trials` rows, stamps `trials.variant_config_id`, then
 * drops the now-redundant `runs.system_prompt_*` columns.
 *
 * Runs in a single transaction. Failure on any sanity check rolls back the
 * entire migration — no half-migrated state possible.
 *
 * Invocation : `npx tsx eval/storage/migrations/001-variant-configs.ts`
 * Idempotent at session level via INSERT OR IGNORE + UPDATE WHERE NULL. After
 * the columns are dropped, re-running detects the missing columns and exits.
 */
import 'dotenv/config';
import { openEvalDb } from '../schema';
import {
  canonicalizeProviderOptions,
  computeVariantConfigId,
} from '../variant-config-id';

const main = (): void => {
  const db = openEvalDb();

  // Detect whether the migration has already run by checking for the
  // legacy columns. If they're gone, nothing to backfill.
  const runsCols = db
    .prepare("PRAGMA table_info('runs')")
    .all() as { name: string }[];
  const hasLegacyColumns = runsCols.some(
    (c) => c.name === 'system_prompt_text',
  );
  if (!hasLegacyColumns) {
    console.log(
      '[migrate 001] runs.system_prompt_* already dropped — migration is a no-op.',
    );
    return;
  }

  let backfilledConfigs = 0;
  let updatedTrials = 0;

  // The legacy `runs.system_prompt_sha256` column stores values prefixed with
  // "sha256:" (see git-state.ts:31). New code (computeSystemPromptId) uses
  // raw hex (cache/hash.ts convention). Strip the prefix during backfill so
  // both representations converge on the raw-hex form going forward.
  const stripSha256Prefix = (s: string): string =>
    s.startsWith('sha256:') ? s.slice('sha256:'.length) : s;

  db.transaction(() => {
    // ─────────────────────────────────────────────────────────────────────
    // Step 1 — Backfill system_prompts
    // Use MIN(started_at) so first_seen_at is the earliest run that used
    // the prompt, regardless of iteration order. Strip the legacy "sha256:"
    // prefix so id is raw hex (matches computeSystemPromptId).
    // ─────────────────────────────────────────────────────────────────────
    db.prepare(
      `
      INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at)
      SELECT
        SUBSTR(system_prompt_sha256, 8) AS id,   -- strip "sha256:" (7 chars + 1 = offset 8)
        system_prompt_text,
        MIN(started_at)
      FROM runs
      WHERE system_prompt_sha256 LIKE 'sha256:%'
      GROUP BY system_prompt_sha256
    `,
    ).run();
    // Belt-and-braces for any legacy row already inserted without the prefix
    db.prepare(
      `
      INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at)
      SELECT system_prompt_sha256, system_prompt_text, MIN(started_at)
      FROM runs
      WHERE system_prompt_sha256 NOT LIKE 'sha256:%'
      GROUP BY system_prompt_sha256
    `,
    ).run();

    // Fix-up: prepareVariantConfigs may have already inserted rows with a
    // NOW timestamp during a cache-hit run prior to this migration. Replace
    // with the true historical MIN so chronology is honest.
    db.prepare(
      `
      UPDATE system_prompts
      SET first_seen_at = (
        SELECT MIN(r.started_at) FROM runs r
        WHERE r.system_prompt_sha256 = system_prompts.id
      )
      WHERE id IN (SELECT system_prompt_sha256 FROM runs)
    `,
    ).run();

    // ─────────────────────────────────────────────────────────────────────
    // Step 2 — Backfill variant_configs
    // For each distinct (provider, model_id, system_prompt_id) combo,
    // reconstruct providerOptions historically (Anthropic = jsonTool,
    // OpenAI = null — matching pre-PR eval.ts:37-43), compute the
    // content-addressed id, INSERT OR IGNORE.
    // ─────────────────────────────────────────────────────────────────────
    type Combo = {
      provider: string;
      model_id: string;
      system_prompt_id: string;
      first_seen_at: string;
    };
    const combos = (
      db
        .prepare(
          `
      SELECT
        t.provider,
        t.model_id,
        r.system_prompt_sha256 AS system_prompt_id_legacy,
        MIN(r.started_at) AS first_seen_at
      FROM trials t
      JOIN runs r ON r.id = t.created_in_run_id
      GROUP BY t.provider, t.model_id, r.system_prompt_sha256
    `,
        )
        .all() as Array<Combo & { system_prompt_id_legacy: string }>
    ).map((c) => ({
      provider: c.provider,
      model_id: c.model_id,
      system_prompt_id: stripSha256Prefix(c.system_prompt_id_legacy),
      first_seen_at: c.first_seen_at,
    }));

    const insertConfig = db.prepare(`
      INSERT OR IGNORE INTO variant_configs (
        id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateConfigFirstSeen = db.prepare(`
      UPDATE variant_configs
      SET first_seen_at = ?
      WHERE id = ? AND first_seen_at > ?
    `);

    for (const combo of combos) {
      const providerOptions =
        combo.provider === 'anthropic'
          ? { anthropic: { structuredOutputMode: 'jsonTool' } }
          : null;
      const providerOptionsJson = canonicalizeProviderOptions(providerOptions);
      const variantConfigId = computeVariantConfigId({
        provider: combo.provider,
        modelId: combo.model_id,
        systemPromptId: combo.system_prompt_id,
        providerOptionsJson,
      });
      insertConfig.run(
        variantConfigId,
        combo.provider,
        combo.model_id,
        combo.system_prompt_id,
        providerOptionsJson,
        combo.first_seen_at,
      );
      // Fix-up for rows pre-inserted with NOW by prepareVariantConfigs.
      updateConfigFirstSeen.run(
        combo.first_seen_at,
        variantConfigId,
        combo.first_seen_at,
      );
      backfilledConfigs += 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 3 — UPDATE trials.variant_config_id via JOIN. Strip the legacy
    // "sha256:" prefix on runs.system_prompt_sha256 so it matches the
    // raw-hex form stored in variant_configs.system_prompt_id.
    // ─────────────────────────────────────────────────────────────────────
    const updateResult = db
      .prepare(
        `
      UPDATE trials
      SET variant_config_id = (
        SELECT vc.id FROM variant_configs vc
        JOIN runs r ON r.id = trials.created_in_run_id
        WHERE vc.provider = trials.provider
          AND vc.model_id = trials.model_id
          AND vc.system_prompt_id = CASE
            WHEN r.system_prompt_sha256 LIKE 'sha256:%' THEN SUBSTR(r.system_prompt_sha256, 8)
            ELSE r.system_prompt_sha256
          END
      )
      WHERE variant_config_id IS NULL
    `,
      )
      .run();
    updatedTrials = updateResult.changes;

    // ─────────────────────────────────────────────────────────────────────
    // Step 4 — Sanity checks (rollback the whole transaction if any fail)
    // ─────────────────────────────────────────────────────────────────────
    const orphanTrials = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM trials WHERE variant_config_id IS NULL`,
        )
        .get() as { n: number }
    ).n;
    if (orphanTrials > 0) {
      throw new Error(
        `Sanity 1 failed: ${orphanTrials} trials still have NULL variant_config_id`,
      );
    }

    const brokenFk = (
      db
        .prepare(
          `
        SELECT COUNT(*) AS n FROM trials t
        LEFT JOIN variant_configs vc ON vc.id = t.variant_config_id
        WHERE t.variant_config_id IS NOT NULL AND vc.id IS NULL
      `,
        )
        .get() as { n: number }
    ).n;
    if (brokenFk > 0) {
      throw new Error(
        `Sanity 2 failed: ${brokenFk} trials reference a missing variant_configs row`,
      );
    }

    const brokenPromptFk = (
      db
        .prepare(
          `
        SELECT COUNT(*) AS n FROM variant_configs vc
        LEFT JOIN system_prompts sp ON sp.id = vc.system_prompt_id
        WHERE sp.id IS NULL
      `,
        )
        .get() as { n: number }
    ).n;
    if (brokenPromptFk > 0) {
      throw new Error(
        `Sanity 3 failed: ${brokenPromptFk} variant_configs reference a missing system_prompts row`,
      );
    }

    const badDedup = (
      db
        .prepare(
          `
        SELECT COUNT(*) AS n FROM (
          SELECT provider, model_id, system_prompt_id, provider_options_json
          FROM variant_configs
          GROUP BY 1, 2, 3, 4
          HAVING COUNT(*) > 1
        )
      `,
        )
        .get() as { n: number }
    ).n;
    if (badDedup > 0) {
      throw new Error(
        `Sanity 5 failed: ${badDedup} duplicate variant_configs by axes — content-addressing is broken`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 5 — Drop redundant columns from runs
    // (Requires SQLite ≥ 3.35.0 ; verified 3.49.2 embedded by better-sqlite3.)
    // ─────────────────────────────────────────────────────────────────────
    db.exec(`ALTER TABLE runs DROP COLUMN system_prompt_text`);
    db.exec(`ALTER TABLE runs DROP COLUMN system_prompt_sha256`);
  })();

  console.log(
    `[migrate 001] Backfilled ${backfilledConfigs} variant_configs, updated ${updatedTrials} trials, dropped legacy columns. ✓`,
  );
};

main();
