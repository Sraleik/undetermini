import type { AssertionCategory, CaseAssertion } from './types';

export type AssertionResult = { name: string; category: AssertionCategory };

export type AssertionDetail = {
  id: string;
  version: number;
  name: string;
  /** Optional long-form scorer explanation, surfaced in the TUI overlay.
   *  Display-only — never persisted to assertion_results, never fingerprinted. */
  description?: string;
  category: AssertionCategory;
  /** Effective weight (authored `weight` clamped to ≥ 0, default 1). Carried
   *  to the storage + TUI layers so category ordering can be derived. */
  weight: number;
  passed: boolean;
};

export type ScoreResult = {
  score: number;
  metadata: {
    passed: AssertionResult[];
    failed: AssertionResult[];
    byCategory: Partial<Record<AssertionCategory, number>>;
    /** Per-assertion detail keyed by stable `id` — consumed by the storage layer
     *  to populate `assertion_results` rows without re-running `check`. */
    allAssertions: AssertionDetail[];
  };
};

export const SCORER_NAME = 'CaseAssertions';
// v2: score is weighted — Σ(wᵢ·passᵢ)/Σ(wᵢ) instead of passed/total. Cases
// with no authored weights (every weight defaults to 1) score identically to
// v1, so only weighted cases shift across the version boundary.
export const CASE_ASSERTIONS_SCORER_VERSION = 2;

const effectiveWeight = (w: number | undefined): number =>
  w === undefined ? 1 : Math.max(0, w);

/** A trial is "perfect" iff every weight-bearing assertion passed. Weight-0
 *  (informational) assertions are excluded — mirroring the weighted `score`,
 *  which also drops them from the denominator. Use for the Pass% metric so it
 *  stays consistent with Score (an informational assertion expected to fail
 *  must not zero out Pass%). */
export const isPerfectTrial = (details: AssertionDetail[]): boolean =>
  details.every((a) => a.weight === 0 || a.passed);

export const caseAssertionsScorer = <TOutput>(args: {
  output: TOutput;
  expected: { assertions: CaseAssertion<TOutput>[] };
}): ScoreResult => {
  const assertions = args.expected.assertions;
  if (assertions.length === 0) {
    return {
      score: 1,
      metadata: { passed: [], failed: [], byCategory: {}, allAssertions: [] },
    };
  }

  const results: AssertionDetail[] = assertions.map((a) => ({
    id: a.id,
    version: a.version,
    name: a.name,
    description: a.description,
    category: a.category,
    weight: effectiveWeight(a.weight),
    passed: a.check(args.output),
  }));

  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  // Weighted fraction-of-importance. A Σweight of 0 (all assertions are
  // informational) can't be normalized — treat as fully satisfied, mirroring
  // the empty-assertions guard above.
  const weightedScore = (rs: AssertionDetail[]): number => {
    const totalW = rs.reduce((s, r) => s + r.weight, 0);
    if (totalW === 0) return 1;
    return rs.reduce((s, r) => s + (r.passed ? r.weight : 0), 0) / totalW;
  };

  const byCategory: Partial<Record<AssertionCategory, number>> = {};
  const categoriesPresent = new Set<AssertionCategory>(
    results.map((r) => r.category),
  );
  for (const cat of categoriesPresent) {
    byCategory[cat] = weightedScore(results.filter((r) => r.category === cat));
  }

  return {
    score: weightedScore(results),
    metadata: {
      passed: passed.map((r) => ({ name: r.name, category: r.category })),
      failed: failed.map((r) => ({ name: r.name, category: r.category })),
      byCategory,
      allAssertions: results,
    },
  };
};
