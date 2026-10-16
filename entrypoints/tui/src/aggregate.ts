import type { TrialResult } from '@undetermini/application/runner-loop';
import { isPerfectTrial } from '@undetermini/core/scorers';
import type { ColKey, SortSpec } from '@undetermini/cli/cli-args';

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
  /** Trials that never ran (retired model, nothing stored): no failure, no cost,
   *  out of every rate. */
  unavailableCalls: number;
  /** A trial that ran has no price: the cost is unknown, never zero. */
  costUnknown: boolean;
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
  const ran = trials.filter((t) => t.status !== 'unavailable');
  const total = ran.length;
  // Perfect trials only (see isPerfectTrial); `status` guard keeps errored
  // trials (empty allAssertions) from counting as perfect.
  const passCount = ran.filter(
    (t) =>
      t.status === 'success' && isPerfectTrial(t.score.metadata.allAssertions),
  ).length;
  const totalCost = ran.reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0);
  // A failed trial has no cost either, but that says nothing about the price.
  const costUnknown = ran.some(
    (t) => t.status === 'success' && t.costNanoUsd === null,
  );
  // $/trial divides by configured trialCount, not completed count — matches
  // the CLI's denominator semantics (cost-per-planned-trial, not cost-per-run-trial).
  const unitCost = trialCount > 0 ? totalCost / trialCount : 0;

  const catAccum: Record<string, { sum: number; count: number }> = {};
  for (const t of ran) {
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
    trialsCompleted: trials.length,
    avgScore: mean(ran.map((t) => t.score.score)),
    passRate: total === 0 ? 0 : passCount / total,
    totalCostUsd: totalCost,
    unitCostUsd: unitCost,
    avgLatencyMs: mean(ran.map((t) => t.realLatencyMs)),
    freshCalls: ran.filter((t) => !t.cacheHit && t.status === 'success').length,
    cacheHits: ran.filter((t) => t.cacheHit).length,
    errorCalls: ran.filter((t) => t.status === 'fail').length,
    unavailableCalls: trials.length - ran.length,
    costUnknown,
    byCategory,
  };
};

const statsSortValue = (s: RunningStats, key: ColKey): number => {
  switch (key) {
    case 'score':
      return s.avgScore;
    case 'pass':
      return s.passRate;
    // Unknown is Infinity; the comparator sends it last whatever the direction.
    case 'cost':
      return s.costUnknown ? Number.POSITIVE_INFINITY : s.totalCostUsd;
    case 'unit-cost':
      return s.costUnknown ? Number.POSITIVE_INFINITY : s.unitCostUsd;
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
        if (!Number.isFinite(va) || !Number.isFinite(vb)) {
          return Number.isFinite(va) ? -1 : 1;
        }
        return (spec.direction === 'asc' ? 1 : -1) * (va - vb);
      }
    }
    return 0;
  });
};
