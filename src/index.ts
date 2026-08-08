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

// ── Surface consumed by a host app that keeps its own subjects and clients ──
// Kalent's `eval/` keeps its subject registry, its retrieval layer and its
// CLI/TUI, and imports the whole engine from here. Everything below is what
// those files reach for; it is public API, not an implementation leak.

// Text comparison helpers used by case assertions
export { normalizeText, tokensInclude } from './engine/text-utils';

// Telemetry
export { telemetryMiddleware } from './engine/telemetry-middleware';
export type { TelemetrySink } from './engine/telemetry-middleware';

// Model capabilities (the model axis)
export {
  MODEL_CAPABILITIES,
  getProvider,
  knownModelIds,
  supportsReasoningEffort,
  supportsThinkingBudget,
  toOpenAiReasoningEffort,
} from './engine/axes/model-capabilities';

// Provider discriminant
export type { Provider } from './engine/variant';

// Axes: declaration and cartesian expansion
export type {
  AxisInputs,
  AxisModelEntry,
  ReasoningEffortValue,
  SchemaAxisValue,
  SysPromptAxisValue,
} from './engine/axes/axis-inputs';
export {
  expandCartesian,
  expandCartesianDetailed,
} from './engine/axes/expand-cartesian';
export type { DroppedCombo } from './engine/axes/expand-cartesian';

// System-prompt axis
export {
  DEFAULT_PROMPTS_DIR,
  resolveSysPrompts,
} from './engine/axes/resolve-sys-prompts';

// Storage
export { openEvalDb, closeEvalDb } from './engine/storage/schema';
export { writeRunToDb } from './engine/storage/write';

// Cache key derivation
export { buildKeyFromCallOptions } from './engine/cache/key-builder';

// Assertion categories
export { CATEGORY_DESCRIPTIONS_FR } from './engine/categories';

// Pricing provenance
export { PRICING_VERIFIED_AT } from './engine/pricing';

// Run provenance
export { readGitState } from './engine/git-state';

// Display formatting shared by clients
export {
  pct1,
  usd,
  ms,
  formatCaseInputForDisplay,
  formatEvalError,
  logEvalTrialFailure,
} from './shared/format';
