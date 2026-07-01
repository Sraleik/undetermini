import type { TrialResult } from '@eval/engine/runner-loop';
import { isPerfectTrial } from '@eval/engine/scorers';
import type { ColKey, SortSpec } from '../cli/cli-args';

export type RunningStats = {
  trialsCompleted: number;
  avgScore: number;
  passRate: number;
  totalCostUsd: number;
  unitCostUsd: number;
  avgLatencyMs: number;
  freshCalls: number;
  cacheHits: number;
  errorCalls: number;
  byCategory: Record<string, number>;
};

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Pure aggregator over the trials a variant has completed so far.
 *  Mirrors the post-run `aggregateVariant` in `runner-loop.ts` but operates
 *  on flat `TrialResult[]` because the TUI sees the per-trial stream, not
 *  the final `CaseResult[]` structure built by `runEval`. */
export const computeRunningStats = (
  trials: TrialResult[],
  trialCount: number,
): RunningStats => {
  const total = trials.length;
  // Perfect trials only (see isPerfectTrial); `status` guard keeps errored
  // trials (empty allAssertions) from counting as perfect.
  const passCount = trials.filter(
    (t) =>
      t.status === 'success' && isPerfectTrial(t.score.metadata.allAssertions),
  ).length;
  const totalCost = trials.reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0);
  // $/trial divides by configured trialCount, not completed count — matches
  // the CLI's denominator semantics (cost-per-planned-trial, not cost-per-run-trial).
  const unitCost = trialCount > 0 ? totalCost / trialCount : 0;

  const catAccum: Record<string, { sum: number; count: number }> = {};
  for (const t of trials) {
    for (const [cat, ratio] of Object.entries(t.score.metadata.byCategory)) {
      if (typeof ratio !== 'number') continue;
      catAccum[cat] ??= { sum: 0, count: 0 };
      catAccum[cat].sum += ratio;
      catAccum[cat].count += 1;
    }
  }
  const byCategory: Record<string, number> = {};
  for (const [cat, { sum, count }] of Object.entries(catAccum)) {
    byCategory[cat] = sum / count;
  }

  return {
    trialsCompleted: total,
    avgScore: mean(trials.map((t) => t.score.score)),
    passRate: total === 0 ? 0 : passCount / total,
    totalCostUsd: totalCost,
    unitCostUsd: unitCost,
    avgLatencyMs: mean(trials.map((t) => t.realLatencyMs)),
    freshCalls: trials.filter((t) => !t.cacheHit && t.status === 'success').length,
    cacheHits: trials.filter((t) => t.cacheHit).length,
    errorCalls: trials.filter((t) => t.status === 'fail').length,
    byCategory,
  };
};

const statsSortValue = (s: RunningStats, key: ColKey): number => {
  switch (key) {
    case 'score':
      return s.avgScore;
    case 'pass':
      return s.passRate;
    case 'cost':
      return s.totalCostUsd;
    case 'unit-cost':
      return s.unitCostUsd;
    case 'latency':
      return s.avgLatencyMs;
    case 'fresh':
      return s.freshCalls;
    case 'cached':
      return s.cacheHits;
    case 'errors':
      return s.errorCalls;
  }
};

/**
 * Order `names` by their RunningStats in `stats`, using the same multi-key
 * spec semantics as the CLI `sortVariants` (first non-equal spec wins, equals
 * fall through to the next tiebreaker, stable for full ties so the caller's
 * incoming order is the final tiebreaker). Used by the per-case TUI view so
 * each case block sorts on its OWN stats rather than the global aggregate.
 * Empty `specs` → `names` returned unchanged. A name absent from `stats`
 * sorts after any name present (deterministic, never throws).
 */
export const sortVariantNamesByStats = (
  names: string[],
  stats: Map<string, RunningStats>,
  specs: SortSpec[],
): string[] => {
  if (specs.length === 0) return names;
  return [...names].sort((a, b) => {
    const sa = stats.get(a);
    const sb = stats.get(b);
    if (sa === undefined || sb === undefined) {
      if (sa === sb) return 0;
      return sa === undefined ? 1 : -1;
    }
    for (const spec of specs) {
      const va = statsSortValue(sa, spec.key);
      const vb = statsSortValue(sb, spec.key);
      if (va !== vb) {
        return (spec.direction === 'asc' ? 1 : -1) * (va - vb);
      }
    }
    return 0;
  });
};
