import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeEvalDb, openEvalDb } from '@eval/engine/storage/schema';
import { insertTrial, lookupTrial, type WriteTrialArgs } from './trial-cache';
import type { CacheKey } from './types';

const baseKey = (overrides: Partial<CacheKey> = {}): CacheKey => ({
  modelId: 'gpt-4.1',
  systemPromptSha: 'sys1',
  schemaSha: 'schema1',
  paramsSha: 'params1',
  promptSha: 'prompt1',
  staticHash: 'static1',
  trialIndex: 0,
  ...overrides,
});

const baseArgs = (
  key: CacheKey,
  overrides: Partial<WriteTrialArgs> = {},
): WriteTrialArgs => ({
  key,
  response: {
    content: [{ type: 'text', text: 'hello' }],
    finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    warnings: [],
  } as unknown as WriteTrialArgs['response'],
  metadata: { createdAt: '2026-05-07T00:00:00.000Z', latencyMs: 42 },
  context: {
    caseId: 'case-1',
    caseSlug: 'slug-1',
    variantName: 'gpt-4.1',
    variantConfigId: 'test-variant-config-id',
    createdInRunId: 'run-1',
    provider: 'openai',
    trialIndex: 0,
  },
  telemetry: {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    cachedInputTokens: 0,
    estimatedCostUsd: 0.0001,
    finishReason: 'stop',
  },
  status: 'success',
  error: null,
  ...overrides,
});

describe('trial-cache (SQLite-backed)', () => {
  let db: Database.Database;

  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
    // Pre-create FK targets so trials.variant_config_id resolves.
    db.prepare(
      `INSERT INTO system_prompts (id, text, first_seen_at) VALUES (?, ?, ?)`,
    ).run('test-prompt-id', 'sys', '2026-05-07T00:00:00.000Z');
    db.prepare(
      `INSERT INTO variant_configs (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'test-variant-config-id',
      'openai',
      'gpt-4.1',
      'test-prompt-id',
      null,
      '2026-05-07T00:00:00.000Z',
    );
  });

  afterEach(() => {
    closeEvalDb();
  });

  it('lookup returns null when no row matches', () => {
    expect(lookupTrial(baseKey(), db)).toBeNull();
  });

  it('insert then lookup round-trips the entry', () => {
    const key = baseKey();
    const trialId = insertTrial(baseArgs(key), db);
    const got = lookupTrial(key, db);
    expect(got?.trialId).toBe(trialId);
    expect(
      (got?.response.content[0] as { type: 'text'; text: string }).text,
    ).toBe('hello');
  });

  it('failed trials are not returned by lookup', () => {
    const key = baseKey();
    insertTrial(baseArgs(key, { status: 'fail', error: 'boom', response: {} as never }), db);
    expect(lookupTrial(key, db)).toBeNull();
  });

  it('append-only: multiple successful rows for the same key, lookup returns the latest', () => {
    const key = baseKey();
    insertTrial(
      baseArgs(key, {
        metadata: { createdAt: '2026-05-07T00:00:00.000Z', latencyMs: 10 },
        response: {
          content: [{ type: 'text', text: 'older' }],
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: [],
        } as never,
      }),
      db,
    );
    insertTrial(
      baseArgs(key, {
        metadata: { createdAt: '2026-05-07T01:00:00.000Z', latencyMs: 99 },
        response: {
          content: [{ type: 'text', text: 'newer' }],
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: [],
        } as never,
      }),
      db,
    );
    const got = lookupTrial(key, db);
    expect(
      (got?.response.content[0] as { type: 'text'; text: string }).text,
    ).toBe('newer');
    expect(got?.metadata.latencyMs).toBe(99);
  });

  it('different cache keys (trial_index) produce distinct rows', () => {
    insertTrial(baseArgs(baseKey({ trialIndex: 0 })), db);
    insertTrial(baseArgs(baseKey({ trialIndex: 1 })), db);
    const count = db
      .prepare('SELECT COUNT(*) as n FROM trials')
      .get() as { n: number };
    expect(count.n).toBe(2);
  });
});
