import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  LanguageModelV3,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCatalog, type Catalog } from '@undetermini/core/models/catalog';
import type { PricePeriod } from '@undetermini/core/models/model';
import { runEval, type RunOpts, type Subject, type SubjectVariant } from './runner-loop';
import { closeEvalDb } from './storage/schema';

// Le test change de dossier courant pour isoler `eval-results/eval.db` ; git n'y répond plus.
vi.mock('./git-state', () => ({
  readGitState: () => ({ sha: 'deadbeef', dirty: false }),
}));

type StubInput = { q: string };
type StubOutput = { echo: string };

const PRICE: PricePeriod = {
  from: '2026-01-01',
  input: '1.00',
  output: '2.00',
  cachedInput: '0.50',
};
// 1 000 000 tokens in and out at PRICE: 1 + 2 = 3 USD.
const COST_PER_TRIAL_NANO_USD = 3_000_000_000;

const catalogOf = (...models: unknown[]): Catalog => {
  const decoded = decodeCatalog(models);
  if (!decoded.ok) throw new Error(decoded.errors.join('; '));
  return decoded.catalog;
};

const caseCount = 10;

const subjectOf = (
  variant: SubjectVariant,
  doGenerate: () => void,
  cases = caseCount,
): Subject<SubjectVariant, StubInput, StubOutput> => ({
  name: 'stub-subject',
  systemPrompt: 'stub system prompt',
  variants: [variant],
  cases: Array.from({ length: cases }, (_, i) => ({
    id: `case-id-${i}`,
    slug: `case-${i}`,
    source: 'test',
    difficulty: 'trivial' as const,
    input: { q: `q-${i}` },
    assertions: [],
  })),
  runOne: async ({ input, variant: v, extraMiddlewares }) => {
    const result = await extraMiddlewares![0]!.wrapGenerate!({
      doGenerate: async () => {
        doGenerate();
        return {
          content: [{ type: 'text', text: input.q }],
          finishReason: 'stop',
          usage: {
            inputTokens: { total: 1_000_000, cacheRead: 0 },
            outputTokens: { total: 1_000_000 },
          },
          warnings: [],
        } as unknown as LanguageModelV3GenerateResult;
      },
      doStream: vi.fn(),
      params: {
        prompt: [{ role: 'user', content: [{ type: 'text', text: input.q }] }],
        temperature: 0,
      },
      model: {
        specificationVersion: 'v3',
        provider: 'fake',
        modelId: v.modelId,
        supportedUrls: {},
      } as unknown as LanguageModelV3,
    });
    return {
      output: { echo: (result.content[0] as { text: string }).text },
      telemetry: {
        latencyMs: 1,
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        cachedInputTokens: 0,
      },
    };
  },
  parse: (raw) => raw as StubOutput,
  buildProviderOptions: () => undefined,
});

const OPTS: Omit<RunOpts, 'runId'> = {
  trialCount: 1,
  maxConcurrency: 1,
  cacheMode: 'auto',
};

describe('runEval : coût, modèle retiré', () => {
  let previousCwd: string;
  let workDir: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    workDir = mkdtempSync(join(tmpdir(), 'undetermini-runner-'));
    process.chdir(workDir);
    closeEvalDb();
  });

  afterEach(() => {
    closeEvalDb();
    process.chdir(previousCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  const variant: SubjectVariant = { name: 'old', provider: 'acme', modelId: 'old-model' };

  it('ISC-4 : 10 cas dont 7 en base, 7 rejoués, 3 unavailable, 0 appel, 0 échec, coût des 7', async () => {
    // 7 cas joués tant que le modèle n'est pas retiré.
    const seedCalls = vi.fn();
    await runEval(
      subjectOf(variant, seedCalls, 7),
      { ...OPTS, runId: 'seed' },
      undefined,
      catalogOf({ provider: 'acme', id: 'old-model', price: [PRICE] }),
    );
    expect(seedCalls).toHaveBeenCalledTimes(7);

    const retiredCalls = vi.fn();
    const result = await runEval(
      subjectOf(variant, retiredCalls),
      { ...OPTS, runId: 'retired' },
      undefined,
      catalogOf({ provider: 'acme', id: 'old-model', price: [PRICE], retired: true }),
    );

    expect(retiredCalls).not.toHaveBeenCalled();
    const trials = result.variants[0]!.cases.flatMap((c) => c.trials);
    expect(trials.filter((t) => t.status === 'success' && t.cacheHit)).toHaveLength(7);
    const unavailable = trials.filter((t) => t.status === 'unavailable');
    expect(unavailable).toHaveLength(3);
    for (const t of unavailable) {
      expect(t.costNanoUsd).toBeNull();
      expect(t.trialId).toBeNull();
      expect(t.score.score).toBe(0);
    }

    const { aggregate } = result.variants[0]!;
    expect(aggregate.errorCalls).toBe(0);
    expect(aggregate.freshCalls).toBe(0);
    expect(aggregate.unavailableCalls).toBe(3);
    expect(aggregate.totalCostNanoUsd).toBe(7 * COST_PER_TRIAL_NANO_USD);
    expect(aggregate.totalCostUsd).toBe(21);
    expect(aggregate.unpricedModels).toEqual([]);
    // 7 essais joués, tous parfaits (aucune assertion) : les 3 indisponibles ne comptent pas.
    expect(aggregate.passRate).toBe(1);
  });

  it('modèle sans prix : coût null (jamais zéro) et modèle nommé comme non tarifé', async () => {
    const result = await runEval(
      subjectOf({ name: 'free', provider: 'acme', modelId: 'free-model' }, vi.fn(), 2),
      { ...OPTS, runId: 'unpriced' },
      undefined,
      catalogOf({ provider: 'acme', id: 'free-model' }),
    );
    const trials = result.variants[0]!.cases.flatMap((c) => c.trials);
    for (const t of trials) {
      expect(t.costNanoUsd).toBeNull();
      expect(t.estimatedCostUsd).toBeNull();
    }
    expect(result.variants[0]!.aggregate.unpricedModels).toEqual(['acme:free-model']);
    expect(result.variants[0]!.aggregate.totalCostNanoUsd).toBe(0);
  });

  it('essai neuf : coût au prix déclaré, estimatedCostUsd dérivé', async () => {
    const result = await runEval(
      subjectOf(variant, vi.fn(), 1),
      { ...OPTS, runId: 'fresh' },
      undefined,
      catalogOf({ provider: 'acme', id: 'old-model', price: [PRICE] }),
    );
    const trial = result.variants[0]!.cases[0]!.trials[0]!;
    expect(trial.costNanoUsd).toBe(COST_PER_TRIAL_NANO_USD);
    expect(trial.estimatedCostUsd).toBe(3);
  });
});
