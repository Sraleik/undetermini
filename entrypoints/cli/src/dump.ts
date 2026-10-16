import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { openEvalDb } from '@undetermini/application/storage/schema';
import type { PricePeriod } from '@undetermini/core/models/model';

const SELECT_RUN_SQL = `SELECT * FROM runs WHERE id = ?`;
const SELECT_TRIALS_SQL = `
  SELECT id, model_id, provider, prompt_sha, static_hash, trial_index,
         case_id, case_slug_at_creation, variant_name,
         output_raw, finish_reason, tokens_input, tokens_output, tokens_total,
         estimated_cost_usd, cost_nano_usd, latency_ms, status, error, created_at
  FROM trials WHERE created_in_run_id = ?
  ORDER BY case_slug_at_creation, variant_name, trial_index
`;
const SELECT_SCORES_SQL = `
  SELECT trial_id, scorer_name, scorer_version,
         assertion_set_fingerprint, score, metadata, computed_at
  FROM trial_scores
  WHERE trial_id IN (SELECT id FROM trials WHERE created_in_run_id = ?)
`;
const SELECT_ASSERTIONS_SQL = `
  SELECT trial_id, assertion_id, assertion_version, passed, category, computed_at
  FROM assertion_results
  WHERE trial_id IN (SELECT id FROM trials WHERE created_in_run_id = ?)
`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The cost of a stored trial in whole nano-dollars. A row with `cost_nano_usd`
 *  is read as is; a historical row converts `estimated_cost_usd`; a row with
 *  neither has no known price and stays `null`, never zero. */
export const readTrialCostNanoUsd = (row: {
  cost_nano_usd?: number | null;
  estimated_cost_usd?: number | null;
}): number | null => {
  if (row.cost_nano_usd !== null && row.cost_nano_usd !== undefined) {
    return row.cost_nano_usd;
  }
  if (row.estimated_cost_usd !== null && row.estimated_cost_usd !== undefined) {
    return Math.round(row.estimated_cost_usd * 1e9);
  }
  return null;
};

/** A run's price snapshot in the `{ version: 2, models }` shape, whichever format
 *  was stored: that one, or the former flat table keyed by model id (no period,
 *  dated from the run). */
export const readPricingTable = ({
  json,
  startedAt,
}: {
  json: string;
  startedAt: string;
}): { version: 2; models: Record<string, PricePeriod[]> } => {
  const parsed: unknown = JSON.parse(json);
  if (isRecord(parsed) && parsed.version === 2 && isRecord(parsed.models)) {
    return {
      version: 2,
      models: parsed.models as Record<string, PricePeriod[]>,
    };
  }
  const models: Record<string, PricePeriod[]> = {};
  for (const [id, flat] of Object.entries(isRecord(parsed) ? parsed : {})) {
    if (
      isRecord(flat) &&
      typeof flat.input === 'number' &&
      typeof flat.output === 'number' &&
      typeof flat.cachedInput === 'number'
    ) {
      models[id] = [
        {
          from: startedAt.slice(0, 10),
          input: String(flat.input),
          output: String(flat.output),
          cachedInput: String(flat.cachedInput),
        },
      ];
    }
  }
  return { version: 2, models };
};

const main = (): void => {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: npx tsx eval/dump.ts <runId>');
    process.exit(1);
  }

  const db = openEvalDb();
  const run = db.prepare(SELECT_RUN_SQL).get(runId) as
    | Record<string, unknown>
    | undefined;
  if (!run) {
    console.error(`No run found with id=${runId}`);
    process.exit(1);
  }

  const trials = db.prepare(SELECT_TRIALS_SQL).all(runId) as Array<
    Record<string, unknown>
  >;
  const scores = db.prepare(SELECT_SCORES_SQL).all(runId) as Array<
    Record<string, unknown>
  >;
  const assertions = db.prepare(SELECT_ASSERTIONS_SQL).all(runId) as Array<
    Record<string, unknown>
  >;

  console.log(
    JSON.stringify(
      {
        schemaVersion: 4,
        runId,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        durationMs: run.duration_ms,
        git: { sha: run.git_sha, dirty: Boolean(run.git_dirty) },
        subject: { name: run.subject_name, evalFile: run.eval_file },
        casesDir: run.cases_dir,
        datasetHash: run.dataset_hash,
        systemPrompt: {
          text: run.system_prompt_text,
          sha256: run.system_prompt_sha256,
        },
        pricing: {
          verifiedAt: run.pricing_verified_at,
          table: readPricingTable({
            json: run.pricing_table_json as string,
            startedAt: run.started_at as string,
          }),
        },
        trials: trials.map((t) => ({
          ...t,
          cost_nano_usd: readTrialCostNanoUsd(
            t as { cost_nano_usd?: number | null; estimated_cost_usd?: number | null },
          ),
          output_raw: t.output_raw ? JSON.parse(t.output_raw as string) : null,
        })),
        scores: scores.map((s) => ({
          ...s,
          metadata: JSON.parse(s.metadata as string),
        })),
        assertions,
      },
      null,
      2,
    ),
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
