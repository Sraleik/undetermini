import { describe, expect, it } from 'vitest';
import { sortVariantNamesByStats, type RunningStats } from './aggregate';
import type { SortSpec } from '../cli/cli-args';

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
  byCategory: {},
  ...over,
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
