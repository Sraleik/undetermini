import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeEvalDb, openEvalDb } from '@eval/engine/storage/schema';
import { trialCacheMiddleware } from './trial-cache-middleware';

const fakeModel = (modelId = 'gpt-4.1'): LanguageModelV3 =>
  ({
    specificationVersion: 'v3',
    provider: 'fake',
    modelId,
    supportedUrls: {},
  }) as unknown as LanguageModelV3;

const fakeParams: LanguageModelV3CallOptions = {
  prompt: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: [{ type: 'text', text: 'find python devs' }] },
  ],
  temperature: 0,
};

const fakeResult = (text = 'hi'): LanguageModelV3GenerateResult =>
  ({
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    warnings: [],
  }) as unknown as LanguageModelV3GenerateResult;

const ctx = {
  caseId: 'case-1',
  caseSlug: 'slug-1',
  variantName: 'gpt-4.1',
  variantConfigId: 'test-variant-config-id',
  createdInRunId: 'run-1',
  provider: 'openai',
  trialIndex: 0,
};

const noopCost = () => null;

describe('trialCacheMiddleware (SQLite-backed)', () => {
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

  it('exposes specificationVersion v3', () => {
    const mw = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
    });
    expect(mw.specificationVersion).toBe('v3');
  });

  it('mode=auto miss → calls doGenerate, inserts row, calls onMiss with trialId', async () => {
    const onMiss = vi.fn();
    const mw = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
      onMiss,
    });
    const doGenerate = vi.fn().mockResolvedValue(fakeResult('first'));
    const result = await mw.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(
      (result.content[0] as { type: 'text'; text: string }).text,
    ).toBe('first');
    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss.mock.calls[0]![0].trialId).toMatch(/[0-9a-f-]{36}/);
  });

  it('mode=auto second call same key → cache hit, doGenerate not called, onHit fires', async () => {
    const mw1 = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
    });
    await mw1.wrapGenerate!({
      doGenerate: vi.fn().mockResolvedValue(fakeResult('first')),
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });

    const onHit = vi.fn();
    const mw2 = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
      onHit,
    });
    const doGenerate2 = vi.fn();
    const result = await mw2.wrapGenerate!({
      doGenerate: doGenerate2,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(doGenerate2).not.toHaveBeenCalled();
    expect(
      (result.content[0] as { type: 'text'; text: string }).text,
    ).toBe('first');
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it('mode=write-only skips lookup → always calls doGenerate, appends fresh row', async () => {
    const seed = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
    });
    await seed.wrapGenerate!({
      doGenerate: vi.fn().mockResolvedValue(fakeResult('original')),
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });

    const writeOnly = trialCacheMiddleware({
      mode: 'write-only',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
    });
    const doGenerate = vi.fn().mockResolvedValue(fakeResult('refreshed'));
    const result = await writeOnly.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(
      (result.content[0] as { type: 'text'; text: string }).text,
    ).toBe('refreshed');

    const count = db.prepare('SELECT COUNT(*) as n FROM trials').get() as {
      n: number;
    };
    expect(count.n).toBe(2);

    // A subsequent auto run sees the most-recent row.
    const verify = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
    });
    const verifyResult = await verify.wrapGenerate!({
      doGenerate: vi.fn(),
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(
      (verifyResult.content[0] as { type: 'text'; text: string }).text,
    ).toBe('refreshed');
  });

  it('two trials same case+config (distinct trialIndex) → two distinct rows (variance preserved)', async () => {
    const mw0 = trialCacheMiddleware({
      mode: 'auto',
      context: { ...ctx, trialIndex: 0 },
      estimateCostUsd: noopCost,
      db,
    });
    const mw1 = trialCacheMiddleware({
      mode: 'auto',
      context: { ...ctx, trialIndex: 1 },
      estimateCostUsd: noopCost,
      db,
    });
    const doGenerate = vi
      .fn()
      .mockResolvedValueOnce(fakeResult('trial-0'))
      .mockResolvedValueOnce(fakeResult('trial-1'));
    await mw0.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    await mw1.wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(doGenerate).toHaveBeenCalledTimes(2);
    const count = db.prepare('SELECT COUNT(*) as n FROM trials').get() as {
      n: number;
    };
    expect(count.n).toBe(2);
  });

  it('retry on same trialIndex → fail then success at idx=0, lookup returns success', async () => {
    const mw = trialCacheMiddleware({
      mode: 'auto',
      context: { ...ctx, trialIndex: 0 },
      estimateCostUsd: noopCost,
      db,
    });
    await expect(
      mw.wrapGenerate!({
        doGenerate: vi.fn().mockRejectedValue(new Error('transient')),
        doStream: vi.fn(),
        params: fakeParams,
        model: fakeModel(),
      }),
    ).rejects.toThrow('transient');
    // Same trialIndex — simulates AI SDK internal retry going back through middleware.
    await mw.wrapGenerate!({
      doGenerate: vi.fn().mockResolvedValue(fakeResult('after-retry')),
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    const verify = trialCacheMiddleware({
      mode: 'auto',
      context: { ...ctx, trialIndex: 0 },
      estimateCostUsd: noopCost,
      db,
    });
    const verifyResult = await verify.wrapGenerate!({
      doGenerate: vi.fn(),
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });
    expect(
      (verifyResult.content[0] as { type: 'text'; text: string }).text,
    ).toBe('after-retry');
    // Append-only: 1 fail row + 1 success row + 0 new rows (cache hit on verify).
    const count = db.prepare('SELECT COUNT(*) as n FROM trials').get() as {
      n: number;
    };
    expect(count.n).toBe(2);
  });

  it('failed doGenerate → row written with status=fail, onFail fires, error rethrown', async () => {
    const onFail = vi.fn();
    const mw = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
      estimateCostUsd: noopCost,
      db,
      onFail,
    });
    const boom = new Error('rate limited');
    await expect(
      mw.wrapGenerate!({
        doGenerate: vi.fn().mockRejectedValue(boom),
        doStream: vi.fn(),
        params: fakeParams,
        model: fakeModel(),
      }),
    ).rejects.toThrow('rate limited');
    const row = db
      .prepare('SELECT status, error FROM trials')
      .get() as { status: string; error: string };
    expect(row.status).toBe('fail');
    expect(row.error).toBe('rate limited');
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});
