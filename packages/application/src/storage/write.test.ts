import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunResult, TrialResult } from '../runner-loop';
import { closeEvalDb, openEvalDb } from './schema';
import { decodeCatalog } from '@undetermini/core/models/catalog';
import { writeRunToDb } from './write';

const trial = (overrides: Partial<TrialResult> = {}): TrialResult => ({
  index: 0,
  status: 'success',
  trialId: '11111111-1111-1111-1111-111111111111',
  output: { foo: 'bar' },
  score: {
    score: 1,
    metadata: {
      passed: [{ name: 'a1', category: 'ROLE' }],
      failed: [],
      byCategory: { ROLE: 1 },
      allAssertions: [
        {
          id: 'aaaa-1',
          version: 1,
          name: 'a1',
          category: 'ROLE',
          weight: 1,
          passed: true,
        },
      ],
    },
  },
  latencyMs: 100,
  realLatencyMs: 100,
  cacheHit: false,
  tokens: { input: 10, output: 5, total: 15 },
  costNanoUsd: 100_000,
  estimatedCostUsd: 0.0001,
  ...overrides,
});

const run = (trials: TrialResult[]): RunResult => ({
  runId: 'test-run-1',
  startedAt: '2026-05-07T12:00:00.000Z',
  finishedAt: '2026-05-07T12:00:01.000Z',
  durationMs: 1000,
  gitSha: 'deadbeef',
  gitDirty: false,
  variants: [
    {
      name: 'gpt-4.1',
      modelId: 'gpt-4.1',
      provider: 'openai',
      cases: [
        {
          caseId: 'case-1',
          caseSlug: 'case-1',
          input: 'hi',
          trials,
          aggregate: {} as never,
        },
      ],
      aggregate: {} as never,
    },
  ],
});

const catalogOf = (...models: unknown[]) => {
  const decoded = decodeCatalog(models);
  if (!decoded.ok) throw new Error(decoded.errors.join('; '));
  return decoded.catalog;
};

const baseArgs = (r: RunResult, db?: Database.Database) => ({
  catalog: catalogOf({ provider: 'openai', id: 'gpt-4.1' }),
  subjectName: 'Example Sentiment',
  evalFile: 'eval-file.ts',
  // A real directory (relative to repo root, where vitest runs) so
  // `datasetHash` can scandir it. It holds no `.case.ts` files, so the hash is
  // the stable empty-set digest — this test exercises DB writes, not hashing.
  casesDir: 'examples/example-sentiment',
  run: r,
  db,
});

describe('writeRunToDb', () => {
  let db: Database.Database;

  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
    // Pre-create a trials row that the trial.trialId refers to (FK target).
    db.prepare(
      `INSERT INTO trials (id, model_id, provider, prompt_sha, static_hash, trial_index,
        case_id, case_slug_at_creation, variant_name, created_in_run_id,
        latency_ms, status, created_at)
       VALUES (?, 'gpt-4.1', 'openai', 'p', 's', 0, 'case-1', 'case-1', 'gpt-4.1', 'test-run-1',
         100, 'success', '2026-05-07T12:00:00.000Z')`,
    ).run('11111111-1111-1111-1111-111111111111');
  });

  afterEach(() => {
    closeEvalDb();
  });

  it('inserts one row in runs', () => {
    writeRunToDb(baseArgs(run([trial()]), db));
    const rows = db.prepare('SELECT * FROM runs').all() as Array<{
      id: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('test-run-1');
  });

  it('inserts assertion_results + trial_scores for successful trials', () => {
    writeRunToDb(baseArgs(run([trial()]), db));
    const ar = db.prepare('SELECT * FROM assertion_results').all();
    const ts = db.prepare('SELECT * FROM trial_scores').all();
    expect(ar).toHaveLength(1);
    expect(ts).toHaveLength(1);
  });

  it('skips failed trials (no assertion_results, no trial_scores)', () => {
    writeRunToDb(
      baseArgs(
        run([
          trial({
            status: 'fail',
            score: {
              score: 0,
              metadata: {
                passed: [],
                failed: [],
                byCategory: {},
                allAssertions: [],
              },
            },
          }),
        ]),
        db,
      ),
    );
    const ar = db.prepare('SELECT * FROM assertion_results').all();
    const ts = db.prepare('SELECT * FROM trial_scores').all();
    expect(ar).toHaveLength(0);
    expect(ts).toHaveLength(0);
  });

  it('INSERT OR IGNORE: re-running with the same fingerprint is a no-op', () => {
    writeRunToDb(baseArgs(run([trial()]), db));
    writeRunToDb({
      ...baseArgs(run([trial()]), db),
      run: { ...run([trial()]), runId: 'test-run-2' },
    });
    // The second writeRunToDb wrote a fresh runs row but assertion_results /
    // trial_scores are keyed on (trial_id, assertion_id, version) and
    // (trial_id, scorer, version, fingerprint) — both already exist for that trial.
    const ar = db.prepare('SELECT * FROM assertion_results').all();
    const ts = db.prepare('SELECT * FROM trial_scores').all();
    expect(ar).toHaveLength(1);
    expect(ts).toHaveLength(1);
    const runs = db.prepare('SELECT id FROM runs ORDER BY id').all();
    expect(runs).toHaveLength(2);
  });

  it('bumping an assertion version produces a new assertion_results row + new fingerprint', () => {
    writeRunToDb(baseArgs(run([trial()]), db));
    const bumped = trial({
      score: {
        score: 1,
        metadata: {
          passed: [{ name: 'a1', category: 'ROLE' }],
          failed: [],
          byCategory: { ROLE: 1 },
          allAssertions: [
            {
              id: 'aaaa-1',
              version: 2,
              name: 'a1',
              category: 'ROLE',
              weight: 1,
              passed: true,
            },
          ],
        },
      },
    });
    writeRunToDb({
      ...baseArgs(run([bumped]), db),
      run: { ...run([bumped]), runId: 'test-run-2' },
    });
    const ar = db
      .prepare('SELECT assertion_version FROM assertion_results ORDER BY assertion_version')
      .all() as Array<{ assertion_version: number }>;
    expect(ar.map((r) => r.assertion_version)).toEqual([1, 2]);
    const ts = db.prepare('SELECT * FROM trial_scores').all();
    expect(ts).toHaveLength(2);
  });

  describe('instantané des prix déclarés', () => {
    const PERIOD = { from: '2026-01-01', input: '2.00', output: '8.00', cachedInput: '0.50' };

    const catalogOf = (...models: unknown[]) => {
      const decoded = decodeCatalog(models);
      if (!decoded.ok) throw new Error(decoded.errors.join('; '));
      return decoded.catalog;
    };

    const snapshot = () => {
      const row = db
        .prepare('SELECT pricing_table_json, pricing_verified_at FROM runs')
        .get() as { pricing_table_json: string; pricing_verified_at: string };
      return { table: JSON.parse(row.pricing_table_json), verifiedAt: row.pricing_verified_at };
    };

    it('garde les prix déclarés des seuls modèles du run, au format versionné', () => {
      const catalog = catalogOf(
        { provider: 'openai', id: 'gpt-4.1', price: [PERIOD] },
        { provider: 'acme', id: 'not-in-this-run', price: [PERIOD] },
      );
      writeRunToDb({ ...baseArgs(run([trial()]), db), catalog });
      expect(snapshot().table).toEqual({
        version: 2,
        models: { 'openai:gpt-4.1': [PERIOD] },
      });
    });

    it('un prix déclaré doublé ensuite ne touche pas l instantané du run enregistré', () => {
      writeRunToDb({
        ...baseArgs(run([trial()]), db),
        catalog: catalogOf({ provider: 'openai', id: 'gpt-4.1', price: [PERIOD] }),
      });
      const doubled = { ...PERIOD, input: '4.00', output: '16.00', cachedInput: '1.00' };
      writeRunToDb({
        ...baseArgs(run([trial()]), db),
        run: { ...run([trial()]), runId: 'test-run-2' },
        catalog: catalogOf({ provider: 'openai', id: 'gpt-4.1', price: [doubled] }),
      });
      const rows = db
        .prepare('SELECT id, pricing_table_json FROM runs ORDER BY id')
        .all() as Array<{ id: string; pricing_table_json: string }>;
      expect(JSON.parse(rows[0]!.pricing_table_json).models['openai:gpt-4.1']).toEqual([PERIOD]);
      expect(JSON.parse(rows[1]!.pricing_table_json).models['openai:gpt-4.1']).toEqual([doubled]);
    });

    it('modèle du run absent du catalogue : liste de prix vide, jamais zéro', () => {
      writeRunToDb({ ...baseArgs(run([trial()]), db), catalog: catalogOf() });
      expect(snapshot().table.models).toEqual({ 'openai:gpt-4.1': [] });
    });

    it('pricing_verified_at : la date de début du run', () => {
      writeRunToDb(baseArgs(run([trial()]), db));
      expect(snapshot().verifiedAt).toBe('2026-05-07');
    });
  });
});
