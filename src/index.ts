/**
 * undetermini — public API barrel.
 *
 * The eval harness for non-deterministic (LLM) code: define a `Subject`, declare
 * `EvalVariant`s (provider × model × reasoning), run them across cases, score
 * with weighted assertions, cache trials, and persist runs to SQLite.
 *
 * This barrel is the typedoc entry point and the library surface. The generic
 * engine lives in `packages/{core,application}`; the runners in `entrypoints/`.
 */

// Core engine
export { EvalEngine } from '@undetermini/application/api';
export { runEval } from '@undetermini/application/runner-loop';
export type {
  Subject,
  SubjectVariant,
  RunOpts,
  TrialResult,
  CaseResult,
  VariantResult,
  RunResult,
} from '@undetermini/application/runner-loop';

// The variant descriptor (provider × model × reasoning knob)
export type { EvalVariant } from '@undetermini/core/variant';

// Cases, assertions, scoring
export {
  defineCase,
} from '@undetermini/core/types';
export type {
  EvalCase,
  CaseAssertion,
  CaseDifficulty,
  AssertionCategory,
  KnownAssertionCategory,
} from '@undetermini/core/types';
export {
  SCORER_NAME,
  CASE_ASSERTIONS_SCORER_VERSION,
  caseAssertionsScorer,
  isPerfectTrial,
} from '@undetermini/core/scorers';
export type {
  AssertionResult,
  AssertionDetail,
  ScoreResult,
} from '@undetermini/core/scorers';

// Cache, telemetry, events
export type { CacheMode } from '@undetermini/core/cache/types';
export type { CallTelemetry } from '@undetermini/application/telemetry-middleware';
export type { EvalEvent, TrialCompletedPayload } from '@undetermini/application/event';

// Pricing
export { computeCost } from '@undetermini/core/pricing';

// Subject registry (composition root)
export {
  SUBJECTS,
  DEFAULT_SUBJECT,
  resolveSubject,
} from '@undetermini/application/subjects/registry';
export type { RegisteredSubject } from '@undetermini/application/subjects/registry';

// Reference subject
export {
  exampleSentimentSubject,
  EXAMPLE_SENTIMENT_EVAL_FILE,
  EXAMPLE_SENTIMENT_CASES_DIR,
} from '@undetermini/examples/example-sentiment/index';
export type { Sentiment, SentimentVariant } from '@undetermini/examples/example-sentiment/index';

// ── Surface consumed by a host app that keeps its own subjects and clients ──
// Kalent's `eval/` keeps its subject registry, its retrieval layer and its
// CLI/TUI, and imports the whole engine from here. Everything below is what
// those files reach for; it is public API, not an implementation leak.

// Text comparison helpers used by case assertions
export { normalizeText, tokensInclude } from '@undetermini/core/text-utils';

// Telemetry
export { telemetryMiddleware } from '@undetermini/application/telemetry-middleware';
export type { TelemetrySink } from '@undetermini/application/telemetry-middleware';

// Model capabilities (the model axis)
export {
  MODEL_CAPABILITIES,
  getProvider,
  knownModelIds,
  supportsReasoningEffort,
  supportsThinkingBudget,
  toOpenAiReasoningEffort,
} from '@undetermini/core/axes/model-capabilities';

// Provider discriminant
export type { Provider } from '@undetermini/core/variant';

// Axes: declaration and cartesian expansion
export type {
  AxisInputs,
  AxisModelEntry,
  ReasoningEffortValue,
  SchemaAxisValue,
  SysPromptAxisValue,
} from '@undetermini/core/axes/axis-inputs';
export {
  expandCartesian,
  expandCartesianDetailed,
} from '@undetermini/core/axes/expand-cartesian';
export type { DroppedCombo } from '@undetermini/core/axes/expand-cartesian';

// System-prompt axis
export {
  DEFAULT_PROMPTS_DIR,
  resolveSysPrompts,
} from '@undetermini/application/axes/resolve-sys-prompts';

// Storage
export { openEvalDb, closeEvalDb } from '@undetermini/application/storage/schema';
export { writeRunToDb } from '@undetermini/application/storage/write';

// Cache key derivation
export { buildKeyFromCallOptions } from '@undetermini/core/cache/key-builder';

// Assertion categories
export { CATEGORY_DESCRIPTIONS_FR } from '@undetermini/core/categories';

// Pricing provenance
export { PRICING_VERIFIED_AT } from '@undetermini/core/pricing';

// Run provenance
export { readGitState } from '@undetermini/application/git-state';

// Display formatting shared by clients
export {
  pct1,
  usd,
  ms,
  formatCaseInputForDisplay,
  formatEvalError,
  logEvalTrialFailure,
} from '@undetermini/core/format';

// Tokenisation used to build case assertions
export { tokensOf } from '@undetermini/core/text-utils';

// Stable hashing — the same function that derives cache keys and fingerprints
export { sha256 } from '@undetermini/core/cache/hash';

// Retroactive rescoring of stored trials
export { syncRetroactive } from '@undetermini/application/rescore/sync-all';

// Event stream contract consumed by clients that render a live run
export type { EventSubscribable } from '@undetermini/application/event';

// Subject-carried libraries: a subject declares its own prompts and schemas,
// so no client ever reaches for a global registry.
export { PROMPT_KIND, SCHEMA_KIND } from '@undetermini/application/subjects/registry';
export type {
  PromptKind,
  SchemaKind,
  RegisteredPrompt,
  RegisteredSchema,
} from '@undetermini/application/subjects/registry';
export { resolveSchemaAxis } from '@undetermini/application/subjects/schema-axis';

// The runners live at `undetermini/clients`, not here: the TUI reaches `ink`,
// whose top-level await would make this barrel impossible to `require`.
export type { SubjectRegistry } from '@undetermini/application/subjects/registry';
export { defaultRegistry, resolveIn } from '@undetermini/application/subjects/registry';

// Config discovery: a host declares its subjects in undetermini.config.ts and
// runs the shipped binaries, the way vitest resolves vitest.config.ts.
export { defineConfig, loadRegistry, findConfigFile } from '@undetermini/application/config';
export type { UndeterminiConfig } from '@undetermini/application/config';
