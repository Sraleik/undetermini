import { describe, expect, it } from 'vitest';
import {
  computeRunningStats,
  sortVariantNamesByStats,
  type RunningStats,
} from './aggregate';
import { COLUMNS_BY_KEY } from './components/VariantTable';
import type { TrialResult } from '@undetermini/application/runner-loop';
import type { SortSpec } from '@undetermini/cli/cli-args';

const stats = (over: Partial<RunningStats>): RunningStats => ({
  trialsCompleted: 1,
  avgScore: 0,
  passRate: 0,
  totalCostUsd: 0,
  unitCostUsd: 0,
  avgLatencyMs: 0,
  freshCalls: 0,
  cacheHits: 0,
  errorCalls: 0,
  unavailableCalls: 0,
  costUnknown: false,
  byCategory: {},
  ...over,
});

const trial = (over: Partial<TrialResult> = {}): TrialResult => ({
  index: 0,
  status: 'success',
  trialId: null,
  output: null,
  score: {
    score: 1,
    metadata: { passed: [], failed: [], byCategory: {}, allAssertions: [] },
  },
  latencyMs: 100,
  realLatencyMs: 100,
  cacheHit: false,
  tokens: { input: 10, output: 10, total: 20 },
  costNanoUsd: 1_000_000,
  estimatedCostUsd: 0.001,
  ...over,
});

const UNAVAILABLE: Partial<TrialResult> = {
  status: 'unavailable',
  score: {
    score: 0,
    metadata: { passed: [], failed: [], byCategory: {}, allAssertions: [] },
  },
  latencyMs: 0,
  realLatencyMs: 0,
  tokens: { input: 0, output: 0, total: 0 },
  costNanoUsd: null,
  estimatedCostUsd: null,
};

describe('computeRunningStats — unavailable trials', () => {
  // Cas vécu : modèle retiré, 10 cas dont 7 en base. Les 3 autres ne sont ni
  // des échecs, ni du coût, ni du dénominateur.
  const sevenAndThree = (): TrialResult[] => [
    ...Array.from({ length: 7 }, (_, index) => trial({ index })),
    ...Array.from({ length: 3 }, (_, index) =>
      trial({ ...UNAVAILABLE, index: 7 + index }),
    ),
  ];

  it('counts no failure and counts the three apart', () => {
    const result = computeRunningStats(sevenAndThree(), 10);
    expect(result.errorCalls).toBe(0);
    expect(result.unavailableCalls).toBe(3);
    expect(result.freshCalls).toBe(7);
  });

  it('costs the seven, not the three', () => {
    const result = computeRunningStats(sevenAndThree(), 10);
    expect(result.totalCostUsd).toBeCloseTo(0.007, 9);
    expect(result.costUnknown).toBe(false);
  });

  it('computes the rates over the seven that ran', () => {
    const result = computeRunningStats(sevenAndThree(), 10);
    expect(result.passRate).toBe(1);
    expect(result.avgScore).toBe(1);
  });

  it('keeps a real failure a failure, next to unavailable ones', () => {
    const result = computeRunningStats(
      [trial(), trial({ status: 'fail', costNanoUsd: null, estimatedCostUsd: null }), trial({ ...UNAVAILABLE })],
      3,
    );
    expect(result.errorCalls).toBe(1);
    expect(result.passRate).toBe(0.5);
    expect(result.costUnknown).toBe(false);
  });
});

describe('computeRunningStats — models without a price', () => {
  const unpriced = () => trial({ costNanoUsd: null, estimatedCostUsd: null });

  it('flags the cost unknown instead of summing it as zero', () => {
    const result = computeRunningStats([unpriced(), unpriced()], 2);
    expect(result.costUnknown).toBe(true);
  });

  it('renders « inconnu », never $0.0000, in the cost columns', () => {
    const result = computeRunningStats([unpriced()], 1);
    expect(COLUMNS_BY_KEY.get('cost')!.render(result)).toBe('inconnu');
    expect(COLUMNS_BY_KEY.get('unit-cost')!.render(result)).toBe('inconnu');
  });

  it('still renders a real price when the cost is known', () => {
    const result = computeRunningStats([trial()], 1);
    expect(COLUMNS_BY_KEY.get('cost')!.render(result)).toBe('$0.0010');
  });

  it('sorts an unknown cost after every known one, either direction', () => {
    const known = stats({ totalCostUsd: 5 });
    const unknown = stats({ costUnknown: true, totalCostUsd: 0 });
    const m = new Map([
      ['known', known],
      ['unknown', unknown],
    ]);
    const names = ['unknown', 'known'];
    expect(
      sortVariantNamesByStats(names, m, [{ key: 'cost', direction: 'asc' }]),
    ).toEqual(['known', 'unknown']);
    expect(
      sortVariantNamesByStats(names, m, [{ key: 'cost', direction: 'desc' }]),
    ).toEqual(['known', 'unknown']);
  });
});


const SCORE_DESC: SortSpec[] = [{ key: 'score', direction: 'desc' }];

describe('sortVariantNamesByStats', () => {
  it('sorts by score desc using THIS map (per-case), not input order', () => {
    // Mirrors the bug: incoming order is the global aggregate order
    // ["--", "v3"], but for this case v3 outscores --.
    const names = ['--', 'v3'];
    const m = new Map<string, RunningStats>([
      ['--', stats({ avgScore: 0.856 })],
      ['v3', stats({ avgScore: 0.931 })],
    ]);
    expect(sortVariantNamesByStats(names, m, SCORE_DESC)).toEqual(['v3', '--']);
  });

  it('keeps incoming order when the case does not reorder it', () => {
    const names = ['--', 'v3'];
    const m = new Map<string, RunningStats>([
      ['--', stats({ avgScore: 0.889 })],
      ['v3', stats({ avgScore: 0.785 })],
    ]);
    expect(sortVariantNamesByStats(names, m, SCORE_DESC)).toEqual(['--', 'v3']);
  });

  it('returns input order unchanged when specs is empty', () => {
    const names = ['b', 'a'];
    const m = new Map<string, RunningStats>([
      ['a', stats({ avgScore: 1 })],
      ['b', stats({ avgScore: 0 })],
    ]);
    expect(sortVariantNamesByStats(names, m, [])).toBe(names);
  });

  it('honors asc direction', () => {
    const names = ['hi', 'lo'];
    const m = new Map<string, RunningStats>([
      ['hi', stats({ avgScore: 0.9 })],
      ['lo', stats({ avgScore: 0.1 })],
    ]);
    expect(
      sortVariantNamesByStats(names, m, [{ key: 'score', direction: 'asc' }]),
    ).toEqual(['lo', 'hi']);
  });

  it('falls through to the next spec on a tie', () => {
    const names = ['a', 'b'];
    const m = new Map<string, RunningStats>([
      ['a', stats({ avgScore: 0.5, avgLatencyMs: 800 })],
      ['b', stats({ avgScore: 0.5, avgLatencyMs: 200 })],
    ]);
    const specs: SortSpec[] = [
      { key: 'score', direction: 'desc' },
      { key: 'latency', direction: 'asc' },
    ];
    expect(sortVariantNamesByStats(names, m, specs)).toEqual(['b', 'a']);
  });

  it('sorts a name with no stats entry after names that have stats', () => {
    const names = ['known', 'missing'];
    const m = new Map<string, RunningStats>([
      ['known', stats({ avgScore: 0.1 })],
    ]);
    expect(sortVariantNamesByStats(names, m, SCORE_DESC)).toEqual([
      'known',
      'missing',
    ]);
  });

  it('maps every ColKey to its RunningStats field', () => {
    const names = ['a', 'b'];
    const probe = (
      key: SortSpec['key'],
      aOver: Partial<RunningStats>,
      bOver: Partial<RunningStats>,
    ): string[] =>
      sortVariantNamesByStats(
        names,
        new Map([
          ['a', stats(aOver)],
          ['b', stats(bOver)],
        ]),
        [{ key, direction: 'desc' }],
      );
    expect(probe('pass', { passRate: 0.9 }, { passRate: 0.1 })).toEqual(['a', 'b']);
    expect(probe('cost', { totalCostUsd: 9 }, { totalCostUsd: 1 })).toEqual(['a', 'b']);
    expect(probe('unit-cost', { unitCostUsd: 9 }, { unitCostUsd: 1 })).toEqual(['a', 'b']);
    expect(probe('latency', { avgLatencyMs: 9 }, { avgLatencyMs: 1 })).toEqual(['a', 'b']);
    expect(probe('fresh', { freshCalls: 9 }, { freshCalls: 1 })).toEqual(['a', 'b']);
    expect(probe('cached', { cacheHits: 9 }, { cacheHits: 1 })).toEqual(['a', 'b']);
    expect(probe('errors', { errorCalls: 9 }, { errorCalls: 1 })).toEqual(['a', 'b']);
  });
});
