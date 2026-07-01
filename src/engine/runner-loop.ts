import type { LanguageModelV3Middleware } from '@ai-sdk/provider';
import pLimit from 'p-limit';
import { readGitState } from './git-state';
import type { CacheMode } from '@eval/engine/cache';
import { trialCacheMiddleware } from '@eval/engine/cache';
import type { CallTelemetry } from '@eval/engine/telemetry-middleware';
import { computeCost } from './pricing';
import type { ScoreResult } from './scorers';
import { caseAssertionsScorer, isPerfectTrial } from './scorers';
import { prepareVariantConfigs } from './storage/variant-config-id';
import type { CaseAssertion, EvalCase } from './types';
import type { TrialCompletedPayload } from '../shared/types';

export type SubjectVariant = {
  name: string;
  modelId: string;
  provider: string;
  /** Optional per-variant override of the subject's default system prompt.
   *  When set, this prompt is hashed into the variant's `variant_config_id`
   *  and used at call time instead of `subject.systemPrompt`. */
  systemPrompt?: string;
};

export type Subject<
  V extends SubjectVariant,
  TInput = unknown,
  TOutput = unknown,
> = {
  name: string;
  systemPrompt: string;
  cases: EvalCase<TInput, TOutput>[];
  variants: V[];
  runOne: (args: {
    input: TInput;
    variant: V;
    extraMiddlewares?: LanguageModelV3Middleware[];
  }) => Promise<{ output: TOutput; telemetry: CallTelemetry }>;
  /** Reconstitute `TOutput` from a stored `output_raw` (LanguageModelV3GenerateResult).
   *  Used by the retroactive rescore in Phase 2. The framework remains lib-agnostic —
   *  each subject picks its own validation stack. */
  parse: (raw: unknown) => TOutput;
  /** Provider-specific options blob for a variant (e.g. `{ openai: { reasoningEffort } }`
   *  or `{ anthropic: { structuredOutputMode, thinking? } }`). Returns `undefined` if
   *  the variant doesn't override any provider option. Used by the runner to compute
   *  `variant_config_id` and by `runOne` to inject via `defaultSettingsMiddleware`. */
  buildProviderOptions: (variant: V) => Record<string, unknown> | undefined;
};

export type RunOpts = {
  trialCount: number;
  maxConcurrency: number;
  cacheMode: CacheMode;
  /** Stable identity stamped on every trial row written during this run. */
  runId: string;
};

export type TrialResult = {
  index: number;
  status: 'success' | 'fail';
  /** UUID of the corresponding `trials` row. `null` only on edge-case writes that
   *  bypass the middleware — never under normal runEval flow. */
  trialId: string | null;
  output: unknown;
  score: ScoreResult;
  latencyMs: number;
  realLatencyMs: number;
  cacheHit: boolean;
  tokens: { input: number; output: number; total: number };
  estimatedCostUsd: number | null;
  error?: string;
};

export type CaseResult = {
  caseId: string;
  caseSlug: string;
  input: unknown;
  trials: TrialResult[];
  aggregate: {
    score: number;
    scoreVariance: number;
    byCategory: Record<string, number>;
    avgLatencyMs: number;
    avgRealLatencyMs: number;
    avgTokensIn: number;
    avgTokensOut: number;
    totalCostUsd: number;
    cacheHits: number;
    freshCalls: number;
    errorCalls: number;
  };
};

export type VariantResult = {
  name: string;
  modelId: string;
  cases: CaseResult[];
  aggregate: {
    avgScore: number;
    passRate: number;
    avgLatencyMs: number;
    avgRealLatencyMs: number;
    avgTokensIn: number;
    avgTokensOut: number;
    totalCostUsd: number;
    cacheHits: number;
    freshCalls: number;
    errorCalls: number;
  };
};

export type RunResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  gitSha: string;
  gitDirty: boolean;
  variants: VariantResult[];
};

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const variance = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
};

const aggregateCase = (trials: TrialResult[]): CaseResult['aggregate'] => {
  const trialScores = trials.map((t) => t.score.score);

  const byCategoryAccum: Record<string, { sum: number; count: number }> = {};
  for (const t of trials) {
    for (const [cat, ratio] of Object.entries(t.score.metadata.byCategory)) {
      if (typeof ratio !== 'number') continue;
      byCategoryAccum[cat] ??= { sum: 0, count: 0 };
      byCategoryAccum[cat].sum += ratio;
      byCategoryAccum[cat].count += 1;
    }
  }
  const byCategory: Record<string, number> = {};
  for (const [cat, { sum, count }] of Object.entries(byCategoryAccum)) {
    byCategory[cat] = sum / count;
  }

  return {
    score: mean(trialScores),
    scoreVariance: variance(trialScores),
    byCategory,
    avgLatencyMs: mean(trials.map((t) => t.latencyMs)),
    avgRealLatencyMs: mean(trials.map((t) => t.realLatencyMs)),
    avgTokensIn: mean(trials.map((t) => t.tokens.input)),
    avgTokensOut: mean(trials.map((t) => t.tokens.output)),
    totalCostUsd: trials
      .map((t) => t.estimatedCostUsd ?? 0)
      .reduce((a, b) => a + b, 0),
    cacheHits: trials.filter((t) => t.cacheHit).length,
    freshCalls: trials.filter((t) => !t.cacheHit && t.status === 'success').length,
    errorCalls: trials.filter((t) => t.status === 'fail').length,
  };
};

const aggregateVariant = (
  cases: CaseResult[],
): VariantResult['aggregate'] => {
  const caseScores = cases.map((c) => c.aggregate.score);
  const allTrials = cases.flatMap((c) => c.trials);
  // Fraction of perfect trials (see isPerfectTrial). Errored trials are excluded
  // from the numerator via the `status` guard (their empty `allAssertions` would
  // otherwise count as perfect) but kept in the denominator, penalizing crashes.
  const passRate =
    allTrials.length === 0
      ? 0
      : allTrials.filter(
          (t) =>
            t.status === 'success' &&
            isPerfectTrial(t.score.metadata.allAssertions),
        ).length / allTrials.length;
  return {
    avgScore: mean(caseScores),
    passRate,
    avgLatencyMs: mean(allTrials.map((t) => t.latencyMs)),
    avgRealLatencyMs: mean(allTrials.map((t) => t.realLatencyMs)),
    avgTokensIn: mean(allTrials.map((t) => t.tokens.input)),
    avgTokensOut: mean(allTrials.map((t) => t.tokens.output)),
    totalCostUsd: cases
      .map((c) => c.aggregate.totalCostUsd)
      .reduce((a, b) => a + b, 0),
    cacheHits: allTrials.filter((t) => t.cacheHit).length,
    freshCalls: allTrials.filter((t) => !t.cacheHit && t.status === 'success').length,
    errorCalls: allTrials.filter((t) => t.status === 'fail').length,
  };
};

export const runEval = async <V extends SubjectVariant, TInput, TOutput>(
  subject: Subject<V, TInput, TOutput>,
  opts: RunOpts,
  onTrialCompleted?: (payload: TrialCompletedPayload) => void,
): Promise<RunResult> => {
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const git = readGitState();
  const limit = pLimit(opts.maxConcurrency);

  // Pre-populate system_prompts + variant_configs BEFORE running any trial so
  // every trial insert can stamp a valid variant_config_id (FK guaranteed).
  const variantConfigIds = prepareVariantConfigs({
    systemPrompt: subject.systemPrompt,
    variants: subject.variants,
    buildProviderOptions: subject.buildProviderOptions,
  });

  type Job = {
    variant: V;
    caseRef: EvalCase<TInput, TOutput>;
    trialIndex: number;
  };
  const jobs: Job[] = [];
  for (const variant of subject.variants) {
    for (const caseRef of subject.cases) {
      for (let i = 0; i < opts.trialCount; i += 1) {
        jobs.push({ variant, caseRef, trialIndex: i });
      }
    }
  }

  const results = new Map<string, TrialResult[]>();
  const keyOf = (variantName: string, caseSlug: string): string =>
    `${variantName}::${caseSlug}`;

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        const stats: {
          hit: boolean;
          originalLatencyMs: number;
          trialId: string | null;
        } = { hit: false, originalLatencyMs: 0, trialId: null };

        const extraMiddlewares: LanguageModelV3Middleware[] = [
          trialCacheMiddleware({
            mode: opts.cacheMode,
            context: {
              caseId: job.caseRef.id,
              caseSlug: job.caseRef.slug,
              variantName: job.variant.name,
              variantConfigId: variantConfigIds.get(job.variant.name)!,
              createdInRunId: opts.runId,
              provider: job.variant.provider,
              trialIndex: job.trialIndex,
            },
            estimateCostUsd: (modelId, inTok, outTok, cachedInTok) =>
              computeCost(modelId, inTok, outTok, cachedInTok),
            onHit: (entry) => {
              stats.hit = true;
              stats.originalLatencyMs = entry.metadata.latencyMs;
              stats.trialId = entry.trialId;
            },
            onMiss: (entry) => {
              stats.trialId = entry.trialId;
            },
            onFail: (trialId) => {
              stats.trialId = trialId;
            },
          }),
        ];

        let trial: TrialResult;
        try {
          const { output, telemetry } = await subject.runOne({
            input: job.caseRef.input,
            variant: job.variant,
            extraMiddlewares,
          });
          const score = caseAssertionsScorer<TOutput>({
            output,
            expected: {
              assertions: job.caseRef.assertions as CaseAssertion<TOutput>[],
            },
          });
          trial = {
            index: job.trialIndex,
            status: 'success',
            trialId: stats.trialId,
            output,
            score,
            latencyMs: telemetry.latencyMs,
            realLatencyMs: stats.hit
              ? stats.originalLatencyMs
              : telemetry.latencyMs,
            cacheHit: stats.hit,
            tokens: {
              input: telemetry.inputTokens,
              output: telemetry.outputTokens,
              total: telemetry.totalTokens,
            },
            estimatedCostUsd: computeCost(
              job.variant.modelId,
              telemetry.inputTokens,
              telemetry.outputTokens,
              telemetry.cachedInputTokens,
            ),
          };
        } catch (err) {
          trial = {
            index: job.trialIndex,
            status: 'fail',
            trialId: stats.trialId,
            output: null,
            score: {
              score: 0,
              metadata: { passed: [], failed: [], byCategory: {}, allAssertions: [] },
            },
            latencyMs: 0,
            realLatencyMs: 0,
            cacheHit: false,
            tokens: { input: 0, output: 0, total: 0 },
            estimatedCostUsd: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        const key = keyOf(job.variant.name, job.caseRef.slug);
        const arr = results.get(key) ?? [];
        arr.push(trial);
        results.set(key, arr);
        onTrialCompleted?.({
          variantName: job.variant.name,
          caseSlug: job.caseRef.slug,
          trialIndex: job.trialIndex,
          trial,
        });
      }),
    ),
  );

  const variants: VariantResult[] = subject.variants.map((variant) => {
    const cases: CaseResult[] = subject.cases.map((caseRef) => {
      const key = keyOf(variant.name, caseRef.slug);
      const trials = (results.get(key) ?? []).sort((a, b) => a.index - b.index);
      return {
        caseId: caseRef.id,
        caseSlug: caseRef.slug,
        input: caseRef.input,
        trials,
        aggregate: aggregateCase(trials),
      };
    });
    return {
      name: variant.name,
      modelId: variant.modelId,
      cases,
      aggregate: aggregateVariant(cases),
    };
  });

  return {
    runId: opts.runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startMs),
    gitSha: git.sha,
    gitDirty: git.dirty,
    variants,
  };
};
