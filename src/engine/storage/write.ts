import type Database from 'better-sqlite3';
import { datasetHash } from '../git-state';
import {
  MODEL_PRICING_USD_PER_1M,
  PRICING_VERIFIED_AT,
} from '../pricing';
import type { RunResult } from '../runner-loop';
import { CASE_ASSERTIONS_SCORER_VERSION, SCORER_NAME } from '../scorers';
import { computeFingerprint } from './fingerprint';
import { openEvalDb } from './schema';

export type WriteRunArgs = {
  subjectName: string;
  evalFile: string;
  casesDir: string;
  run: RunResult;
  /** Override the default singleton DB. Used by tests to point at `:memory:`. */
  db?: Database.Database;
};

// system_prompt_text and system_prompt_sha256 moved to the `system_prompts`
// table (referenced by variant_configs.system_prompt_id). Populated by
// prepareVariantConfigs before any trial runs.
const INSERT_RUN_SQL = `
  INSERT INTO runs (
    id, started_at, finished_at, duration_ms,
    git_sha, git_dirty, dataset_hash,
    eval_file, cases_dir, subject_name,
    pricing_table_json, pricing_verified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ASSERTION_RESULT_SQL = `
  INSERT OR IGNORE INTO assertion_results (
    trial_id, assertion_id, assertion_version,
    passed, category, computed_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`;

const INSERT_TRIAL_SCORE_SQL = `
  INSERT OR IGNORE INTO trial_scores (
    trial_id, scorer_name, scorer_version,
    assertion_set_fingerprint, score, metadata, computed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const writeRunToDb = (args: WriteRunArgs): void => {
  const db = args.db ?? openEvalDb();
  const now = new Date().toISOString();

  const insertRun = db.prepare(INSERT_RUN_SQL);
  const insertAssertion = db.prepare(INSERT_ASSERTION_RESULT_SQL);
  const insertScore = db.prepare(INSERT_TRIAL_SCORE_SQL);

  const tx = db.transaction(() => {
    insertRun.run(
      args.run.runId,
      args.run.startedAt,
      args.run.finishedAt,
      args.run.durationMs,
      args.run.gitSha,
      args.run.gitDirty ? 1 : 0,
      datasetHash(args.casesDir),
      args.evalFile,
      args.casesDir,
      args.subjectName,
      JSON.stringify(MODEL_PRICING_USD_PER_1M),
      PRICING_VERIFIED_AT,
    );

    for (const variant of args.run.variants) {
      for (const caseRef of variant.cases) {
        for (const trial of caseRef.trials) {
          if (trial.status !== 'success' || trial.trialId === null) continue;

          for (const a of trial.score.metadata.allAssertions) {
            insertAssertion.run(
              trial.trialId,
              a.id,
              a.version,
              a.passed ? 1 : 0,
              a.category,
              now,
            );
          }

          const refs = trial.score.metadata.allAssertions.map((a) => ({
            id: a.id,
            version: a.version,
          }));
          insertScore.run(
            trial.trialId,
            SCORER_NAME,
            CASE_ASSERTIONS_SCORER_VERSION,
            computeFingerprint(refs),
            trial.score.score,
            JSON.stringify(trial.score.metadata),
            now,
          );
        }
      }
    }
  });

  tx();
};
