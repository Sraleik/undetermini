/** Categories shipped for the talent-search subject. Kept as a literal union so
 *  authors get autocompletion, but the list is OPEN — see `AssertionCategory`. */
export type KnownAssertionCategory =
  | 'JOB_TITLE'
  | 'ROLE'
  | 'LOCATION'
  | 'HISTORY'
  | 'YEARS_OF_EXPERIENCE'
  | 'BUNDLE'
  | 'EDUCATION_DEGREE'
  | 'EXCLUSION'
  | 'SKILL'
  | 'LANGUAGE'
  | 'KEYWORD'
  | 'EXACT_MATCH'
  | 'OTHER';

/** Display/grouping label on an assertion. OPEN union: the `(string & {})` arm
 *  accepts any domain-specific category a NEW subject introduces, while the
 *  `KnownAssertionCategory` arm preserves autocompletion for the talent values.
 *  Categories are display-only — they never affect scoring (see `scorers.ts`),
 *  so widening the type is behaviour-neutral. */
export type AssertionCategory = KnownAssertionCategory | (string & {});

export type CaseAssertion<TOutput = unknown> = {
  /** UUID v4. Stable identity for audit; never bump. Generate via `node -e "console.log(crypto.randomUUID())"`. */
  id: string;
  /** Bump manually (1 → 2 → 3) when `check` semantics change. Renaming `name` does NOT require a bump. */
  version: number;
  name: string;
  /** Long-form explanation of WHAT this scorer checks and WHY (coverage
   *  rationale, the rule it enforces, edge cases). Shown in the TUI overlay
   *  when the scorer is selected — the `name` stays a short scannable label,
   *  the `description` carries the detail. Display-only: not part of the
   *  fingerprint, never affects scoring or the cache. */
  description?: string;
  category: AssertionCategory;
  /** Relative importance in the case score. Default 1. Clamped to ≥ 0.
   *  0 = informational: tracked and displayed, excluded from the score
   *  denominator (use for baseline-signal assertions). Category weight is
   *  DERIVED (Σ of member weights) for display ordering — never authored. */
  weight?: number;
  check: (output: TOutput) => boolean;
};

export type CaseDifficulty = 'trivial' | 'easy' | 'medium' | 'hard';

export type EvalCase<TInput = unknown, TOutput = unknown, TIdeal = unknown> = {
  id: string;
  slug: string;
  source: string;
  difficulty: CaseDifficulty;
  input: TInput;
  assertions: CaseAssertion<TOutput>[];
  /**
   * Canonical "100%-scoring" answer for this case — the output the author
   * considers ideal (it should pass every assertion). OPT-IN and subject-defined:
   * `TIdeal` is the subject's domain shape (for the talent subject this is
   * `SearchTalentsFilterType`, validated by `eval/scripts/validate-retrieval.ts`,
   * which runs these through the REAL rank-mode engine to close the proxy→outcome
   * loop the assertion score alone cannot). Display/validation-only: never part
   * of scoring, the cache, or the fingerprint. Defaults to `unknown` so cases
   * that don't declare a `TIdeal` keep `idealFilters` untyped.
   */
  idealFilters?: TIdeal[];
};

export const defineCase = <TInput, TOutput, TIdeal = unknown>(
  c: EvalCase<TInput, TOutput, TIdeal>,
): EvalCase<TInput, TOutput, TIdeal> => c;
