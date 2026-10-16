import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeEvalDb, openEvalDb } from '../storage/schema';
import type { PricePeriod } from '@undetermini/core/models/model';
import { UnavailableTrialError, trialCacheMiddleware } from './trial-cache-middleware';

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
      db,
    });
    expect(mw.specificationVersion).toBe('v3');
  });

  it('mode=auto miss → calls doGenerate, inserts row, calls onMiss with trialId', async () => {
    const onMiss = vi.fn();
    const mw = trialCacheMiddleware({
      mode: 'auto',
      context: ctx,
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
      db,
    });
    const mw1 = trialCacheMiddleware({
      mode: 'auto',
      context: { ...ctx, trialIndex: 1 },
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

const INTRO: PricePeriod = {
  from: '2026-07-01',
  input: '1.00',
  output: '2.00',
  cachedInput: '0.50',
};
const STANDARD: PricePeriod = {
  from: '2026-09-01',
  input: '3.00',
  output: '6.00',
  cachedInput: '1.50',
};

// 1 000 000 tokens in and out: 1 + 2 = 3 USD at the intro rate.
const INTRO_COST_NANO_USD = 3_000_000_000;

const millionTokens = (text: string): LanguageModelV3GenerateResult =>
  ({
    ...fakeResult(text),
    usage: {
      inputTokens: { total: 1_000_000, cacheRead: 0 },
      outputTokens: { total: 1_000_000 },
    },
  }) as unknown as LanguageModelV3GenerateResult;

describe('trialCacheMiddleware : coût au prix déclaré', () => {
  let db: Database.Database;

  const run = (
    options: Partial<Parameters<typeof trialCacheMiddleware>[0]>,
    doGenerate = vi.fn().mockResolvedValue(millionTokens('priced')),
    modelId = 'gpt-4.1',
  ) =>
    trialCacheMiddleware({ mode: 'auto', context: ctx, db, ...options }).wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(modelId),
    });

  const costColumns = () =>
    db
      .prepare(
        'SELECT cost_nano_usd, estimated_cost_usd FROM trials ORDER BY rowid DESC LIMIT 1',
      )
      .get() as { cost_nano_usd: number | null; estimated_cost_usd: number | null };

  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
    db.prepare(
      `INSERT INTO system_prompts (id, text, first_seen_at) VALUES (?, ?, ?)`,
    ).run('test-prompt-id', 'sys', '2026-05-07T00:00:00.000Z');
    db.prepare(
      `INSERT INTO variant_configs (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('test-variant-config-id', 'openai', 'gpt-4.1', 'test-prompt-id', null, '2026-05-07T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    closeEvalDb();
  });

  it('essai neuf : coût en nano-dollars au prix en vigueur à la date d appel', async () => {
    const onMiss = vi.fn();
    await run({ pricePeriods: [INTRO, STANDARD], onMiss });
    expect(costColumns()).toEqual({
      cost_nano_usd: INTRO_COST_NANO_USD,
      estimated_cost_usd: 3,
    });
    expect(onMiss.mock.calls[0]![0].costNanoUsd).toBe(INTRO_COST_NANO_USD);
  });

  it('modèle sans prix : coût null, jamais zéro', async () => {
    const onMiss = vi.fn();
    await run({ onMiss });
    expect(costColumns()).toEqual({ cost_nano_usd: null, estimated_cost_usd: null });
    expect(onMiss.mock.calls[0]![0].costNanoUsd).toBeNull();
  });

  it('ISC-10 : un essai appelé le 2026-08-15 et rejoué en octobre coûte le tarif intro', async () => {
    await run({ pricePeriods: [INTRO, STANDARD] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));
    const onHit = vi.fn();
    await run({ pricePeriods: [INTRO, STANDARD], onHit }, vi.fn());
    expect(onHit.mock.calls[0]![0].costNanoUsd).toBe(INTRO_COST_NANO_USD);
  });

  it('ISC-8 : prix déclaré doublé après le run, le coût relu est inchangé', async () => {
    await run({ pricePeriods: [INTRO] });
    const doubled: PricePeriod = { ...INTRO, input: '2.00', output: '4.00', cachedInput: '1.00' };
    const onHit = vi.fn();
    await run({ pricePeriods: [doubled], onHit }, vi.fn());
    expect(onHit.mock.calls[0]![0].costNanoUsd).toBe(INTRO_COST_NANO_USD);
  });

  it('ligne sans coût : prend le prix en vigueur à sa date created_at', async () => {
    await run({});
    db.prepare(
      `UPDATE trials SET cost_nano_usd = NULL, estimated_cost_usd = NULL, created_at = '2026-08-15T09:00:00.000Z'`,
    ).run();
    vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));
    const onHit = vi.fn();
    await run({ pricePeriods: [INTRO, STANDARD], onHit }, vi.fn());
    expect(onHit.mock.calls[0]![0].costNanoUsd).toBe(INTRO_COST_NANO_USD);
  });

  it('ligne sans coût et modèle sans prix : coût null', async () => {
    await run({});
    const onHit = vi.fn();
    await run({ onHit }, vi.fn());
    expect(onHit.mock.calls[0]![0].costNanoUsd).toBeNull();
  });

  it('ligne historique : estimated_cost_usd est converti en nano-dollars à la lecture, sans réécriture', async () => {
    await run({});
    db.prepare(`UPDATE trials SET cost_nano_usd = NULL, estimated_cost_usd = 0.5`).run();
    const onHit = vi.fn();
    await run({ pricePeriods: [STANDARD], onHit }, vi.fn());
    expect(onHit.mock.calls[0]![0].costNanoUsd).toBe(500_000_000);
    expect(costColumns()).toEqual({ cost_nano_usd: null, estimated_cost_usd: 0.5 });
  });
});

describe('trialCacheMiddleware : fournisseur et modèle retiré', () => {
  let db: Database.Database;

  const run = (
    options: Partial<Parameters<typeof trialCacheMiddleware>[0]>,
    doGenerate = vi.fn().mockResolvedValue(fakeResult('fresh')),
  ) =>
    trialCacheMiddleware({ mode: 'auto', context: ctx, db, ...options }).wrapGenerate!({
      doGenerate,
      doStream: vi.fn(),
      params: fakeParams,
      model: fakeModel(),
    });

  beforeEach(() => {
    closeEvalDb();
    db = openEvalDb(':memory:');
    db.prepare(
      `INSERT INTO system_prompts (id, text, first_seen_at) VALUES (?, ?, ?)`,
    ).run('test-prompt-id', 'sys', '2026-05-07T00:00:00.000Z');
    db.prepare(
      `INSERT INTO variant_configs (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('test-variant-config-id', 'openai', 'gpt-4.1', 'test-prompt-id', null, '2026-05-07T00:00:00.000Z');
  });

  afterEach(() => {
    closeEvalDb();
  });

  it('ISC-13 : un essai stocké sous openai n est pas rejoué pour la même id sous openrouter', async () => {
    await run({});
    const viaOpenrouter = vi.fn().mockResolvedValue(fakeResult('other route'));
    await run({ context: { ...ctx, provider: 'openrouter' } }, viaOpenrouter);
    expect(viaOpenrouter).toHaveBeenCalledTimes(1);

    const sameProvider = vi.fn();
    await run({}, sameProvider);
    expect(sameProvider).not.toHaveBeenCalled();
  });

  it('modèle retiré, essai en base : rejoué sans appel', async () => {
    await run({});
    const doGenerate = vi.fn();
    const result = await run({ retired: true }, doGenerate);
    expect(doGenerate).not.toHaveBeenCalled();
    expect((result.content[0] as { text: string }).text).toBe('fresh');
  });

  it('modèle retiré, essai absent : unavailable, aucun appel, aucune ligne écrite', async () => {
    const doGenerate = vi.fn();
    const onUnavailable = vi.fn();
    const onFail = vi.fn();
    await expect(run({ retired: true, onUnavailable, onFail }, doGenerate)).rejects.toBeInstanceOf(
      UnavailableTrialError,
    );
    expect(doGenerate).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
    const count = db.prepare('SELECT COUNT(*) as n FROM trials').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('modèle retiré en mode write-only : jamais d appel non plus', async () => {
    const doGenerate = vi.fn();
    await expect(
      run({ retired: true, mode: 'write-only' }, doGenerate),
    ).rejects.toBeInstanceOf(UnavailableTrialError);
    expect(doGenerate).not.toHaveBeenCalled();
  });
});
