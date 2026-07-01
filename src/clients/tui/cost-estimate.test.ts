import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeEvalDb, openEvalDb } from '@eval/engine/storage/schema';
import {
  buildPlannedRuns,
  estimateAvgTokens,
  estimateCacheHits,
  estimateRunCost,
  type PlannedRun,
} from './cost-estimate';

const insertSuccessTrial = (
  db: Database.Database,
  args: {
    modelId: string;
    promptSha: string;
    staticHash: string;
    trialIndex: number;
    tokensIn: number;
    tokensOut: number;
  },
): void => {
  // The `variant_config_id` migration adds trials → variant_configs(id) and
  // variant_configs → system_prompts(id) FKs. Seed both parents idempotently
  // (PK conflicts ignored) so this helper can be called freely per test.
  db.prepare(
    `INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at)
     VALUES ('sp-test', 'test system prompt', '2026-05-15T00:00:00.000Z')`,
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO variant_configs
       (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at)
     VALUES ('cfg', 'openai', 'model', 'sp-test', NULL, '2026-05-15T00:00:00.000Z')`,
  ).run();
  db.prepare(
    `INSERT INTO trials (
       id, model_id, provider, prompt_sha, static_hash, trial_index,
       case_id, case_slug_at_creation, variant_name, created_in_run_id,
       output_raw, output_hash, finish_reason,
       tokens_input, tokens_output, tokens_total, estimated_cost_usd,
       latency_ms, status, error, created_at, variant_config_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `trial-${args.promptSha}-${args.staticHash}-${args.trialIndex}`,
    args.modelId,
    'openai',
    args.promptSha,
    args.staticHash,
    args.trialIndex,
    'case-id',
    'case-slug',
    'variant-name',
    'run-1',
    '{}', // output_raw — LOOKUP_SQL requires output_raw IS NOT NULL
    'out-hash',
    'stop',
    args.tokensIn,
    args.tokensOut,
    args.tokensIn + args.tokensOut,
    null,
    100,
    'success',
    null,
    '2026-05-15T00:00:00.000Z',
    'cfg',
  );
};

const resolvedRun = (
  args: Omit<PlannedRun, 'resolved'>,
): PlannedRun => ({ ...args, resolved: true });

describe('estimateAvgTokens', () => {
  let db: Database.Database;
  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
  });
  afterEach(() => closeEvalDb());

  it('returns null when no successful trials exist for the model', () => {
    expect(estimateAvgTokens('gpt-4o-mini', db)).toBeNull();
  });

  it('returns averaged input/output tokens across successful trials', () => {
    insertSuccessTrial(db, {
      modelId: 'gpt-4o-mini',
      promptSha: 'p',
      staticHash: 's',
      trialIndex: 0,
      tokensIn: 100,
      tokensOut: 50,
    });
    insertSuccessTrial(db, {
      modelId: 'gpt-4o-mini',
      promptSha: 'p',
      staticHash: 's',
      trialIndex: 1,
      tokensIn: 200,
      tokensOut: 150,
    });
    expect(estimateAvgTokens('gpt-4o-mini', db)).toEqual({
      input: 150,
      output: 100,
    });
  });

  it('averages tokens for the SPECIFIC static_hash when provided (per-variant)', () => {
    // Verbose variant (static_hash V) vs trimmed variant (static_hash T), same model.
    insertSuccessTrial(db, {
      modelId: 'gpt-4.1',
      promptSha: 'p',
      staticHash: 'V',
      trialIndex: 0,
      tokensIn: 1000,
      tokensOut: 100,
    });
    insertSuccessTrial(db, {
      modelId: 'gpt-4.1',
      promptSha: 'p',
      staticHash: 'T',
      trialIndex: 0,
      tokensIn: 200,
      tokensOut: 100,
    });
    // Per-variant avg picks only the matching static_hash, not the blended mean.
    expect(estimateAvgTokens('gpt-4.1', db, 'V')).toEqual({
      input: 1000,
      output: 100,
    });
    expect(estimateAvgTokens('gpt-4.1', db, 'T')).toEqual({
      input: 200,
      output: 100,
    });
  });

  it('falls back to per-model AVG when the static_hash has no history', () => {
    insertSuccessTrial(db, {
      modelId: 'gpt-4.1',
      promptSha: 'p',
      staticHash: 'KNOWN',
      trialIndex: 0,
      tokensIn: 500,
      tokensOut: 100,
    });
    // 'UNSEEN' has zero rows → falls back to the per-model average (the KNOWN row).
    expect(estimateAvgTokens('gpt-4.1', db, 'UNSEEN')).toEqual({
      input: 500,
      output: 100,
    });
  });
});

describe('estimateCacheHits', () => {
  let db: Database.Database;
  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
  });
  afterEach(() => closeEvalDb());

  it('counts existing trials by exact (model, prompt_sha, static_hash) capped by trialCount', () => {
    for (const trialIndex of [0, 1, 2, 3, 4]) {
      insertSuccessTrial(db, {
        modelId: 'gpt-4o-mini',
        promptSha: 'P1',
        staticHash: 'S1',
        trialIndex,
        tokensIn: 100,
        tokensOut: 50,
      });
    }
    const planned: PlannedRun[] = [
      resolvedRun({
        modelId: 'gpt-4o-mini',
        promptSha: 'P1',
        staticHash: 'S1',
        trialCount: 3,
      }),
    ];
    expect(estimateCacheHits(planned, db)).toBe(3);
  });

  it('does not count a different static_hash (system prompt changed)', () => {
    for (const trialIndex of [0, 1, 2]) {
      insertSuccessTrial(db, {
        modelId: 'gpt-4.1',
        promptSha: 'P',
        staticHash: 'OLD',
        trialIndex,
        tokensIn: 1,
        tokensOut: 1,
      });
    }
    const planned: PlannedRun[] = [
      resolvedRun({
        modelId: 'gpt-4.1',
        promptSha: 'P',
        staticHash: 'NEW',
        trialCount: 3,
      }),
    ];
    expect(estimateCacheHits(planned, db)).toBe(0);
  });

  it('ignores unresolved runs', () => {
    const planned: PlannedRun[] = [
      {
        modelId: 'gpt-4.1',
        promptSha: '',
        staticHash: '',
        trialCount: 3,
        resolved: false,
      },
    ];
    expect(estimateCacheHits(planned, db)).toBe(0);
  });
});

describe('estimateRunCost', () => {
  let db: Database.Database;
  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
  });
  afterEach(() => closeEvalDb());

  it('all trials cached across two cases → zero fresh', () => {
    for (const [p, s] of [
      ['Pa', 'Sa'],
      ['Pb', 'Sb'],
    ]) {
      for (const trialIndex of [0, 1, 2]) {
        insertSuccessTrial(db, {
          modelId: 'gpt-4.1',
          promptSha: p,
          staticHash: s,
          trialIndex,
          tokensIn: 10,
          tokensOut: 10,
        });
      }
    }
    const result = estimateRunCost(
      [
        resolvedRun({
          modelId: 'gpt-4.1',
          promptSha: 'Pa',
          staticHash: 'Sa',
          trialCount: 3,
        }),
        resolvedRun({
          modelId: 'gpt-4.1',
          promptSha: 'Pb',
          staticHash: 'Sb',
          trialCount: 3,
        }),
      ],
      db,
    );
    expect(result.totalTrials).toBe(6);
    expect(result.cachedTrials).toBe(6);
    expect(result.freshTrials).toBe(0);
    expect(result.unresolvedPairs).toBe(0);
  });

  it('unresolved pair counts as fresh and is reported', () => {
    const result = estimateRunCost(
      [
        {
          modelId: 'gpt-4o-mini',
          promptSha: '',
          staticHash: '',
          trialCount: 10,
          resolved: false,
        },
      ],
      db,
    );
    expect(result.totalTrials).toBe(10);
    expect(result.cachedTrials).toBe(0);
    expect(result.freshTrials).toBe(10);
    expect(result.unresolvedPairs).toBe(1);
    expect(result.modelsLackingData).toEqual(['gpt-4o-mini']);
  });

  it('estimates cost using historical avg tokens × pricing for fresh trials', () => {
    insertSuccessTrial(db, {
      modelId: 'gpt-4o-mini',
      promptSha: 'hist',
      staticHash: 'hist',
      trialIndex: 0,
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    const result = estimateRunCost(
      [
        resolvedRun({
          modelId: 'gpt-4o-mini',
          promptSha: 'NEW',
          staticHash: 'NEW',
          trialCount: 1,
        }),
      ],
      db,
    );
    expect(result.cachedTrials).toBe(0);
    expect(result.freshTrials).toBe(1);
    expect(result.modelsLackingData).toEqual([]);
    expect(result.estimatedCostUsd).toBeCloseTo(0.15 + 0.6, 5);
  });

  it('cache-aware: first fresh trial pays full input, the rest are cache-read', () => {
    // Historical profile for this exact variant: 1M input, 1M output per trial.
    insertSuccessTrial(db, {
      modelId: 'gpt-4.1',
      promptSha: 'hist',
      staticHash: 'NEW',
      trialIndex: 99,
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    // 3 fresh trials of the SAME (variant × case): trial_index 99 is the only
    // existing slot but trialCount=3 with promptSha 'P' (different) → 0 cached.
    const result = estimateRunCost(
      [
        resolvedRun({
          modelId: 'gpt-4.1',
          promptSha: 'P',
          staticHash: 'NEW',
          trialCount: 3,
        }),
      ],
      db,
    );
    expect(result.freshTrials).toBe(3);
    // gpt-4.1: input $2, cachedInput $0.50, output $8 per 1M.
    // full: 1 input @ $2 + 3 output @ $8 = 2 + 24 = 26.
    // cached: 2 inputs @ $0.50 = 1.
    expect(result.estimatedCostUsd).toBeCloseTo(2 + 24 + 1, 5);
  });

  it('cache-aware estimate is far below the naive (all-fresh-full-input) cost', () => {
    insertSuccessTrial(db, {
      modelId: 'gpt-4.1',
      promptSha: 'hist',
      staticHash: 'S',
      trialIndex: 0,
      tokensIn: 14_718,
      tokensOut: 330,
    });
    const result = estimateRunCost(
      [
        resolvedRun({
          modelId: 'gpt-4.1',
          promptSha: 'P',
          staticHash: 'S',
          trialCount: 30,
        }),
      ],
      db,
    );
    expect(result.freshTrials).toBe(30);
    // Naive (no cache): 30 × (2*14718 + 8*330)/1e6 = 30 × 0.031076 ≈ $0.932.
    const naive = (30 * (2 * 14718 + 8 * 330)) / 1e6;
    // Cache-aware: 1 full input + 29 cached inputs + 30 full outputs.
    const full = (1 * 2 * 14718 + 30 * 8 * 330) / 1e6;
    const cached = (29 * 0.5 * 14718) / 1e6;
    expect(result.estimatedCostUsd).toBeCloseTo(full + cached, 6);
    expect(result.estimatedCostUsd).toBeLessThan(naive);
  });
});

describe('buildPlannedRuns', () => {
  it('marks pairs present in the resolved map as resolved, others not', () => {
    const variants = [
      { name: 'v1', modelId: 'gpt-4.1' },
      { name: 'v2', modelId: 'gpt-4.1' },
    ] as never[];
    const cases = [{ slug: 'c1' }, { slug: 'c2' }] as never[];
    const keys = new Map([
      ['v1\x00c1', { modelId: 'gpt-4.1', promptSha: 'p', staticHash: 's' }],
    ]);
    const planned = buildPlannedRuns(variants, cases, 5, keys);
    expect(planned).toHaveLength(4);
    expect(planned.filter((p) => p.resolved)).toHaveLength(1);
    expect(planned.find((p) => p.resolved)).toMatchObject({
      modelId: 'gpt-4.1',
      promptSha: 'p',
      staticHash: 's',
      trialCount: 5,
    });
  });
});
