import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CaseResult,
  RunResult,
  TrialResult,
  VariantResult,
} from '@undetermini/application/runner-loop';
import { printConsoleSummary } from './console-printer';

const trial = (overrides: Partial<TrialResult> = {}): TrialResult => ({
  index: 0,
  status: 'success',
  trialId: null,
  output: null,
  score: {
    score: 1,
    metadata: { passed: [], failed: [], byCategory: {}, allAssertions: [] },
  },
  latencyMs: 10,
  realLatencyMs: 10,
  cacheHit: false,
  tokens: { input: 1, output: 1, total: 2 },
  costNanoUsd: 0,
  estimatedCostUsd: 0,
  ...overrides,
});

const caseOf = (trials: TrialResult[]): CaseResult => ({
  caseId: 'c1',
  caseSlug: 'case-1',
  input: 'hello',
  trials,
  aggregate: {
    score: 1,
    scoreVariance: 0,
    byCategory: {},
    avgLatencyMs: 10,
    avgRealLatencyMs: 10,
    avgTokensIn: 1,
    avgTokensOut: 1,
    totalCostUsd: 0,
    totalCostNanoUsd: 0,
    unpricedModels: [],
    cacheHits: 0,
    freshCalls: trials.length,
    errorCalls: 0,
    unavailableCalls: 0,
  },
});

const variantOf = (
  name: string,
  cost: { nanoUsd: number; unpriced: boolean },
  overrides: Partial<VariantResult['aggregate']> = {},
): VariantResult => ({
  name,
  modelId: name,
  provider: 'p',
  cases: [caseOf([trial()])],
  aggregate: {
    avgScore: 1,
    passRate: 1,
    avgLatencyMs: 10,
    avgRealLatencyMs: 10,
    avgTokensIn: 1,
    avgTokensOut: 1,
    totalCostUsd: cost.nanoUsd / 1e9,
    totalCostNanoUsd: cost.nanoUsd,
    unpricedModels: cost.unpriced ? [`p:${name}`] : [],
    cacheHits: 0,
    freshCalls: 1,
    errorCalls: 0,
    unavailableCalls: 0,
    ...overrides,
  },
});

const runOf = (variants: VariantResult[]): RunResult => ({
  runId: 'r',
  startedAt: '2026-10-16T00:00:00.000Z',
  finishedAt: '2026-10-16T00:00:01.000Z',
  durationMs: 1000,
  gitSha: 'abc',
  gitDirty: false,
  variants,
});

const render = (variants: VariantResult[]): string => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  printConsoleSummary('subject', runOf(variants), {
    trialCount: 1,
    cases: 1,
    variants: variants.length,
  });
  return lines.join('\n');
};

afterEach(() => vi.restoreAllMocks());

describe('printConsoleSummary — coûts', () => {
  it('affiche « inconnu » pour un modèle sans prix, jamais $0.00 (ISC-18)', () => {
    const out = render([variantOf('no-price', { nanoUsd: 0, unpriced: true })]);
    const row = out.split('\n').find((l) => l.includes('no-price'));
    expect(row).toContain('inconnu');
    expect(row).not.toContain('$0.00');
    expect(out).not.toMatch(/\$0\.0+\b/);
  });

  it('dit « partiel, 1 modèle sans prix » quand le total en contient (ISC-6)', () => {
    const out = render([
      variantOf('priced', { nanoUsd: 2_000_000, unpriced: false }),
      variantOf('no-price', { nanoUsd: 0, unpriced: true }),
    ]);
    const total = out.split('\n').find((l) => l.startsWith('Total'));
    expect(total).toContain('partiel, 1 modèle sans prix');
  });

  it('accorde le pluriel : « 2 modèles sans prix »', () => {
    const out = render([
      variantOf('a', { nanoUsd: 0, unpriced: true }),
      variantOf('b', { nanoUsd: 0, unpriced: true }),
    ]);
    const total = out.split('\n').find((l) => l.startsWith('Total'));
    expect(total).toContain('partiel, 2 modèles sans prix');
  });

  it('garde le coût chiffré quand tous les modèles sont tarifés', () => {
    const out = render([variantOf('priced', { nanoUsd: 2_000_000, unpriced: false })]);
    expect(out).toContain('$0.0020');
    expect(out).not.toContain('inconnu');
    expect(out).not.toContain('partiel');
  });
});

describe('printConsoleSummary — essais indisponibles', () => {
  const unavailableVariant = (): VariantResult => {
    const unavailable = trial({
      status: 'unavailable',
      costNanoUsd: null,
      estimatedCostUsd: null,
    });
    return {
      ...variantOf('retired', { nanoUsd: 0, unpriced: false }, {
        avgScore: 0,
        passRate: 0,
        freshCalls: 0,
        unavailableCalls: 1,
      }),
      cases: [caseOf([unavailable])],
    };
  };

  it('affiche « indisponible » et ne le compte pas comme échec', () => {
    const out = render([unavailableVariant()]);
    const row = out.split('\n').find((l) => l.includes('retired'));
    expect(row).toContain('indisponible');
    expect(out).not.toContain('Erreurs (trials qui ont planté)');
    expect(out).toMatch(/0 errors/);
  });
});
