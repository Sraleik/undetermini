/**
 * undetermini — public API barrel.
 *
 * The eval harness for non-deterministic (LLM) code: define a `Subject`, declare
 * `EvalVariant`s (provider × model × reasoning), run them across cases, score
 * with weighted assertions, cache trials, and persist runs to SQLite.
 *
 * This barrel is the typedoc entry point and the library surface. The generic
 * engine is `@eval/engine/*`; concrete use cases live under `@eval/subjects/*`.
 */

// Core engine
export { EvalEngine } from './engine/api';
export { runEval } from './engine/runner-loop';
export type {
  Subject,
  SubjectVariant,
  RunOpts,
  TrialResult,
  CaseResult,
  VariantResult,
  RunResult,
} from './engine/runner-loop';

// The variant descriptor (provider × model × reasoning knob)
export type { EvalVariant } from './engine/variant';

// Cases, assertions, scoring
export {
  defineCase,
} from './engine/types';
export type {
  EvalCase,
  CaseAssertion,
  CaseDifficulty,
  AssertionCategory,
  KnownAssertionCategory,
} from './engine/types';
export {
  SCORER_NAME,
  CASE_ASSERTIONS_SCORER_VERSION,
  caseAssertionsScorer,
  isPerfectTrial,
} from './engine/scorers';
export type {
  AssertionResult,
  AssertionDetail,
  ScoreResult,
} from './engine/scorers';

// Cache, telemetry, events
export type { CacheMode } from './engine/cache/types';
export type { CallTelemetry } from './engine/telemetry-middleware';
export type { EvalEvent, TrialCompletedPayload } from './shared/types';

// Pricing
export { computeCost } from './engine/pricing';

// Subject registry (composition root)
export {
  SUBJECTS,
  DEFAULT_SUBJECT,
  resolveSubject,
} from './subjects/registry';
export type { RegisteredSubject } from './subjects/registry';

// Reference subject
export {
  exampleSentimentSubject,
  EXAMPLE_SENTIMENT_EVAL_FILE,
  EXAMPLE_SENTIMENT_CASES_DIR,
} from './subjects/example-sentiment';
export type { Sentiment, SentimentVariant } from './subjects/example-sentiment';
