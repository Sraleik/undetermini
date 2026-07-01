import 'dotenv/config';
import type Database from 'better-sqlite3';
// The engine stays subject-agnostic: `syncRetroactive` takes the subject as a
// parameter and never touches a concrete subject. The CLI `main()` below picks
// the default subject via a dynamic import, so loading this module (e.g. from a
// test) pulls no subject and no composition root.
import { computeFingerprint } from '@eval/engine/storage/fingerprint';
import { openEvalDb } from '@eval/engine/storage/schema';
import {
  CASE_ASSERTIONS_SCORER_VERSION,
  SCORER_NAME,
  caseAssertionsScorer,
} from '@eval/engine/scorers';
import type { CaseAssertion, EvalCase } from '@eval/engine/types';
import type { Subject, SubjectVariant } from '@eval/engine/runner-loop';

export type SyncSummary = {
  trialsScanned: number;
  assertionResultsInserted: number;
  trialScoresInserted: number;
  skippedCaseMissing: number;
  skippedParseError: number;
};

type Logger = {
  warn: (msg: string) => void;
  info: (msg: string) => void;
};

const consoleLogger: Logger = {
  warn: (msg) => console.warn(`[sync] ${msg}`),
  info: (msg) => console.log(`[sync] ${msg}`),
};

const SELECT_TRIALS_SQL = `
  SELECT id, case_id, output_raw
  FROM trials
  WHERE status = 'success' AND output_raw IS NOT NULL
`;

const SELECT_EXISTING_ASSERTION_SQL = `
  SELECT 1 FROM assertion_results
  WHERE trial_id = ? AND assertion_id = ? AND assertion_version = ?
  LIMIT 1
`;

const INSERT_ASSERTION_SQL = `
  INSERT OR IGNORE INTO assertion_results (
    trial_id, assertion_id, assertion_version, passed, category, computed_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`;

const INSERT_TRIAL_SCORE_SQL = `
  INSERT OR IGNORE INTO trial_scores (
    trial_id, scorer_name, scorer_version,
    assertion_set_fingerprint, score, metadata, computed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const syncRetroactive = <V extends SubjectVariant, TInput, TOutput>(
  subject: Subject<V, TInput, TOutput>,
  opts: { db?: Database.Database; logger?: Logger } = {},
): SyncSummary => {
  const db = opts.db ?? openEvalDb();
  const logger = opts.logger ?? consoleLogger;

  const currentAssertions = new Map<string, EvalCase<TInput, TOutput>>();
  for (const caseRef of subject.cases) {
    currentAssertions.set(caseRef.id, caseRef);
  }

  const trials = db.prepare(SELECT_TRIALS_SQL).all() as Array<{
    id: string;
    case_id: string;
    output_raw: string;
  }>;

  const existsStmt = db.prepare(SELECT_EXISTING_ASSERTION_SQL);
  const insertAssertion = db.prepare(INSERT_ASSERTION_SQL);
  const insertScore = db.prepare(INSERT_TRIAL_SCORE_SQL);

  const summary: SyncSummary = {
    trialsScanned: trials.length,
    assertionResultsInserted: 0,
    trialScoresInserted: 0,
    skippedCaseMissing: 0,
    skippedParseError: 0,
  };

  const tx = db.transaction(() => {
    for (const row of trials) {
      const caseRef = currentAssertions.get(row.case_id);
      if (!caseRef) {
        logger.warn(
          `trial ${row.id}: case_id=${row.case_id} no longer exists in subject — skipped`,
        );
        summary.skippedCaseMissing += 1;
        continue;
      }

      let parsed: TOutput;
      try {
        parsed = subject.parse(JSON.parse(row.output_raw));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`trial ${row.id}: parse failed (${msg}) — skipped`);
        summary.skippedParseError += 1;
        continue;
      }

      const now = new Date().toISOString();
      const assertions = caseRef.assertions as CaseAssertion<TOutput>[];

      // Single source of truth: the live weighted scorer. Avoids the historic
      // divergence where this path computed an UNWEIGHTED passed/total score
      // (and counted weight-0 assertions) while the runner used weighted Σwp/Σw.
      const { score, metadata } = caseAssertionsScorer({
        output: parsed,
        expected: { assertions },
      });

      // Insert assertion_results for any (assertion_id, version) not yet present.
      // metadata.allAssertions carries the per-assertion pass/fail (+ weight).
      for (const a of metadata.allAssertions) {
        const existing = existsStmt.get(row.id, a.id, a.version);
        if (!existing) {
          insertAssertion.run(
            row.id,
            a.id,
            a.version,
            a.passed ? 1 : 0,
            a.category,
            now,
          );
          summary.assertionResultsInserted += 1;
        }
      }

      const fingerprint = computeFingerprint(
        assertions.map((a) => ({ id: a.id, version: a.version })),
      );

      const result = insertScore.run(
        row.id,
        SCORER_NAME,
        CASE_ASSERTIONS_SCORER_VERSION,
        fingerprint,
        score,
        JSON.stringify(metadata),
        now,
      );
      if (result.changes > 0) summary.trialScoresInserted += 1;
    }
  });

  tx();

  logger.info(
    `done. scanned=${summary.trialsScanned} assertion_results+=${summary.assertionResultsInserted} trial_scores+=${summary.trialScoresInserted} skip(case-missing)=${summary.skippedCaseMissing} skip(parse-fail)=${summary.skippedParseError}`,
  );

  return summary;
};

const main = async (): Promise<void> => {
  // Dynamic import keeps the concrete subject out of module load — the engine
  // stays pure; only the CLI entry pulls a subject.
  const { exampleSentimentSubject } = await import(
    '@eval/subjects/example-sentiment'
  );
  const summary = syncRetroactive(exampleSentimentSubject);
  if (summary.trialsScanned === 0) {
    console.log(
      '[sync] no successful trials in DB — run `npm run eval` first.',
    );
  }
};

if (process.argv[1]?.endsWith('sync-all.ts')) {
  void main();
}
