import 'dotenv/config';
import { openEvalDb } from '@eval/engine/storage/schema';

const SELECT_RUN_SQL = `SELECT * FROM runs WHERE id = ?`;
const SELECT_TRIALS_SQL = `
  SELECT id, model_id, provider, prompt_sha, static_hash, trial_index,
         case_id, case_slug_at_creation, variant_name,
         output_raw, finish_reason, tokens_input, tokens_output, tokens_total,
         estimated_cost_usd, latency_ms, status, error, created_at
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
          table: JSON.parse(run.pricing_table_json as string),
        },
        trials: trials.map((t) => ({
          ...t,
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

main();
