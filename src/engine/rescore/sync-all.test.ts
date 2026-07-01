import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeFingerprint } from '@eval/engine/storage/fingerprint';
import { closeEvalDb, openEvalDb } from '@eval/engine/storage/schema';
import { CASE_ASSERTIONS_SCORER_VERSION, SCORER_NAME } from '@eval/engine/scorers';
import type { Subject, SubjectVariant } from '@eval/engine/runner-loop';
import type { CaseAssertion, EvalCase } from '@eval/engine/types';
import { syncRetroactive } from './sync-all';

type TestOutput = { value: number };
type TestVariant = SubjectVariant;

const seedTrial = (
  db: Database.Database,
  args: {
    trialId: string;
    caseId: string;
    outputRaw: string;
  },
): void => {
  db.prepare(
    `INSERT INTO trials (
      id, model_id, provider, prompt_sha, static_hash, trial_index,
      case_id, case_slug_at_creation, variant_name, created_in_run_id,
      output_raw, latency_ms, status, created_at
    ) VALUES (?, 'gpt-4.1', 'openai', 'p', 's', 0, ?, 'slug', 'gpt-4.1', 'run-1',
      ?, 100, 'success', '2026-05-07T12:00:00.000Z')`,
  ).run(args.trialId, args.caseId, args.outputRaw);
};

const seedAssertionResult = (
  db: Database.Database,
  args: {
    trialId: string;
    assertionId: string;
    version: number;
    passed: boolean;
    category: string;
  },
): void => {
  db.prepare(
    `INSERT INTO assertion_results (
      trial_id, assertion_id, assertion_version, passed, category, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    args.trialId,
    args.assertionId,
    args.version,
    args.passed ? 1 : 0,
    args.category,
    '2026-05-07T12:00:00.000Z',
  );
};

const seedTrialScore = (
  db: Database.Database,
  args: { trialId: string; fingerprint: string; score: number },
): void => {
  db.prepare(
    `INSERT INTO trial_scores (
      trial_id, scorer_name, scorer_version, assertion_set_fingerprint,
      score, metadata, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.trialId,
    SCORER_NAME,
    CASE_ASSERTIONS_SCORER_VERSION,
    args.fingerprint,
    args.score,
    '{}',
    '2026-05-07T12:00:00.000Z',
  );
};

const buildSubject = (
  cases: EvalCase<unknown, TestOutput>[],
  parseFn: (raw: unknown) => TestOutput = (raw) => raw as TestOutput,
): Subject<TestVariant, unknown, TestOutput> =>
  ({
    name: 'test-subject',
    systemPrompt: 'sys',
    cases,
    variants: [{ name: 'gpt-4.1', modelId: 'gpt-4.1' }],
    runOne: () => Promise.reject(new Error('runOne not used in sync-all')),
    parse: parseFn,
  }) as unknown as Subject<TestVariant, unknown, TestOutput>;

const assertion = (
  id: string,
  version: number,
  check: (o: TestOutput) => boolean,
  name = 'test',
): CaseAssertion<TestOutput> => ({
  id,
  version,
  name,
  category: 'OTHER',
  check,
});

const caseV1 = (): EvalCase<unknown, TestOutput> => ({
  id: 'case-A',
  slug: 'case-a',
  source: 'TEST',
  difficulty: 'trivial',
  input: 'hi',
  assertions: [assertion('a1', 1, (o) => o.value > 0, 'positive')],
});

describe('syncRetroactive', () => {
  let db: Database.Database;

  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
  });

  afterEach(() => {
    closeEvalDb();
    vi.restoreAllMocks();
  });

  it('idempotent: re-syncing a fresh-Phase-1 DB inserts 0 new rows', () => {
    const subj = buildSubject([caseV1()]);
    const fp = computeFingerprint([{ id: 'a1', version: 1 }]);
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });
    seedAssertionResult(db, {
      trialId: 't1',
      assertionId: 'a1',
      version: 1,
      passed: true,
      category: 'OTHER',
    });
    seedTrialScore(db, { trialId: 't1', fingerprint: fp, score: 1 });

    const summary = syncRetroactive(subj, { db, logger: { warn: vi.fn(), info: vi.fn() } });

    expect(summary.assertionResultsInserted).toBe(0);
    expect(summary.trialScoresInserted).toBe(0);
    expect(summary.trialsScanned).toBe(1);
  });

  it('bump version → +1 assertion_result and +1 trial_score per trial', () => {
    const subj = buildSubject([
      {
        ...caseV1(),
        assertions: [assertion('a1', 2, (o) => o.value > 0)],
      },
    ]);
    const fpV1 = computeFingerprint([{ id: 'a1', version: 1 }]);
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });
    seedAssertionResult(db, {
      trialId: 't1',
      assertionId: 'a1',
      version: 1,
      passed: true,
      category: 'OTHER',
    });
    seedTrialScore(db, { trialId: 't1', fingerprint: fpV1, score: 1 });

    const summary = syncRetroactive(subj, { db, logger: { warn: vi.fn(), info: vi.fn() } });

    expect(summary.assertionResultsInserted).toBe(1);
    expect(summary.trialScoresInserted).toBe(1);

    const versions = (
      db
        .prepare('SELECT assertion_version FROM assertion_results ORDER BY assertion_version')
        .all() as Array<{ assertion_version: number }>
    ).map((r) => r.assertion_version);
    expect(versions).toEqual([1, 2]);
  });

  it('add assertion → +1 assertion_result and +1 trial_score per trial', () => {
    const subj = buildSubject([
      {
        ...caseV1(),
        assertions: [
          assertion('a1', 1, (o) => o.value > 0),
          assertion('a2', 1, (o) => o.value < 10, 'bounded'),
        ],
      },
    ]);
    const fpOld = computeFingerprint([{ id: 'a1', version: 1 }]);
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });
    seedAssertionResult(db, {
      trialId: 't1',
      assertionId: 'a1',
      version: 1,
      passed: true,
      category: 'OTHER',
    });
    seedTrialScore(db, { trialId: 't1', fingerprint: fpOld, score: 1 });

    const summary = syncRetroactive(subj, { db, logger: { warn: vi.fn(), info: vi.fn() } });

    expect(summary.assertionResultsInserted).toBe(1);
    expect(summary.trialScoresInserted).toBe(1);
  });

  it('remove assertion → 0 new assertion_result, +1 trial_score (new fingerprint without that id)', () => {
    const subj = buildSubject([
      {
        ...caseV1(),
        assertions: [], // a1 removed
      },
    ]);
    const fpOld = computeFingerprint([{ id: 'a1', version: 1 }]);
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });
    seedAssertionResult(db, {
      trialId: 't1',
      assertionId: 'a1',
      version: 1,
      passed: true,
      category: 'OTHER',
    });
    seedTrialScore(db, { trialId: 't1', fingerprint: fpOld, score: 1 });

    const summary = syncRetroactive(subj, { db, logger: { warn: vi.fn(), info: vi.fn() } });

    expect(summary.assertionResultsInserted).toBe(0);
    expect(summary.trialScoresInserted).toBe(1);
  });

  it('case removed from subject → log warn, skip the trial', () => {
    const subj = buildSubject([]); // case-A no longer in subject
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });

    const warn = vi.fn();
    const summary = syncRetroactive(subj, {
      db,
      logger: { warn, info: vi.fn() },
    });

    expect(summary.skippedCaseMissing).toBe(1);
    expect(summary.assertionResultsInserted).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('case-A'));
  });

  it('parse failure → log warn, skip the trial, no crash', () => {
    const subj = buildSubject([caseV1()], () => {
      throw new Error('parse blew up');
    });
    seedTrial(db, {
      trialId: 't1',
      caseId: 'case-A',
      outputRaw: JSON.stringify({ value: 5 }),
    });

    const warn = vi.fn();
    const summary = syncRetroactive(subj, {
      db,
      logger: { warn, info: vi.fn() },
    });

    expect(summary.skippedParseError).toBe(1);
    expect(summary.assertionResultsInserted).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('parse blew up'));
  });
});
