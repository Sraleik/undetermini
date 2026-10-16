import { createHash, randomUUID } from 'node:crypto';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import type Database from 'better-sqlite3';
import { openEvalDb } from '../storage/schema';
import type { CacheEntry, CacheKey } from '@undetermini/core/cache/types';
import type { PricePeriod } from '@undetermini/core/models/model';
import { trialCost } from '@undetermini/core/models/price';

export type TrialContext = {
  caseId: string;
  caseSlug: string;
  variantName: string;
  /** Content-addressed identity of the (provider, model, systemPrompt, providerOptions)
   *  combination. Computed by the runner via `prepareVariantConfigs(...)` before any
   *  trial is inserted, so the FK trials.variant_config_id → variant_configs.id is
   *  guaranteed at insert time. */
  variantConfigId: string;
  createdInRunId: string;
  provider: string;
  /** Deterministic trial slot assigned by the runner. Replaces the in-process
   *  counter so AI SDK retries reuse the same slot instead of leaking forward. */
  trialIndex: number;
};

export type WriteTrialArgs = {
  key: CacheKey;
  response: LanguageModelV3GenerateResult;
  metadata: { createdAt: string; latencyMs: number };
  context: TrialContext;
  telemetry: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    /** Derived from `costNanoUsd`, kept for display. */
    estimatedCostUsd: number | null;
    /** Whole nano-dollars at the declared price of the call date; `null` = no price. */
    costNanoUsd: number | null;
    finishReason: string | null;
  };
  status: 'success' | 'fail';
  error: string | null;
};

// Latest successful trial for a (provider, model, prompt, static, trial_index) tuple.
// Failed trials are excluded so they're never replayed as cache hits.
const LOOKUP_SQL = `
  SELECT id, output_raw, latency_ms, created_at,
    tokens_input, tokens_output, tokens_cached_input, estimated_cost_usd, cost_nano_usd
  FROM trials
  WHERE provider = ?
    AND model_id = ?
    AND prompt_sha = ?
    AND static_hash = ?
    AND trial_index = ?
    AND status = 'success'
    AND output_raw IS NOT NULL
  ORDER BY created_at DESC, rowid DESC
  LIMIT 1
`;

const INSERT_SQL = `
  INSERT INTO trials (
    id, model_id, provider, prompt_sha, static_hash, trial_index,
    case_id, case_slug_at_creation, variant_name, variant_config_id, created_in_run_id,
    output_raw, output_hash, finish_reason, tokens_input, tokens_output,
    tokens_total, tokens_cached_input, estimated_cost_usd, cost_nano_usd, latency_ms, status, error, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?
  )
`;

/** What a stored row says about its own cost, before any replay pricing. */
export type StoredTrialCost = {
  costNanoUsd: number | null;
  estimatedCostUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  createdAt: string;
};

export type StoredTrial = CacheEntry & { stored: StoredTrialCost };

/** The cost a replayed trial carries. A row with `cost_nano_usd` is read as is.
 *  A historical row converts `estimated_cost_usd` once, at read time. A row with
 *  neither takes the price in force on its `created_at` date. History is never
 *  rewritten. */
export const replayCostNanoUsd = ({
  stored,
  periods,
}: {
  stored: StoredTrialCost;
  periods: PricePeriod[];
}): number | null => {
  if (stored.costNanoUsd !== null) return stored.costNanoUsd;
  if (stored.estimatedCostUsd !== null) {
    return Math.round(stored.estimatedCostUsd * 1e9);
  }
  return trialCost({
    periods,
    calledAt: stored.createdAt.slice(0, 10),
    inputTokens: stored.inputTokens,
    outputTokens: stored.outputTokens,
    cachedInputTokens: stored.cachedInputTokens,
  });
};

export const lookupTrial = (
  key: CacheKey,
  provider: string,
  db: Database.Database = openEvalDb(),
): StoredTrial | null => {
  const row = db
    .prepare(LOOKUP_SQL)
    .get(provider, key.modelId, key.promptSha, key.staticHash, key.trialIndex) as
    | {
        id: string;
        output_raw: string;
        latency_ms: number;
        created_at: string;
        tokens_input: number | null;
        tokens_output: number | null;
        tokens_cached_input: number | null;
        estimated_cost_usd: number | null;
        cost_nano_usd: number | null;
      }
    | undefined;
  if (!row) return null;

  const response = JSON.parse(row.output_raw) as LanguageModelV3GenerateResult;
  // `response.timestamp` is a Date in the AI SDK contract; JSON roundtrip
  // loses the class, downstream formatters call `.toISOString()` on it.
  const ts = response.response?.timestamp;
  if (typeof ts === 'string') {
    response.response!.timestamp = new Date(ts);
  }

  return {
    trialId: row.id,
    key,
    metadata: { createdAt: row.created_at, latencyMs: row.latency_ms },
    response,
    stored: {
      costNanoUsd: row.cost_nano_usd,
      estimatedCostUsd: row.estimated_cost_usd,
      inputTokens: row.tokens_input ?? 0,
      outputTokens: row.tokens_output ?? 0,
      cachedInputTokens: row.tokens_cached_input ?? 0,
      createdAt: row.created_at,
    },
  };
};

// Flip a freshly-inserted `success` row to `fail` when the model generated a
// payload but DOWNSTREAM validation (the prod service's `Output.object`)
// rejected it — a trial the cache middleware could only see as a model-level
// success. The raw is DELIBERATELY kept: the whole point is to debug the
// payload that failed. `status='fail'` also removes it from cache replay
// (LOOKUP_SQL filters `status='success'`), so a re-run re-calls instead of
// serving invalid junk. Guarded to `status='success'` so it never rewrites a
// model-level fail (raw already null) or a shared historical row.
const MARK_FAILED_SQL = `
  UPDATE trials SET status = 'fail', error = ?
  WHERE id = ? AND status = 'success'
`;

export const markTrialFailed = (
  trialId: string,
  error: string,
  db: Database.Database = openEvalDb(),
): void => {
  db.prepare(MARK_FAILED_SQL).run(error, trialId);
};

export const insertTrial = (
  args: WriteTrialArgs,
  db: Database.Database = openEvalDb(),
): string => {
  const trialId = randomUUID();
  const outputRaw = args.status === 'success' ? JSON.stringify(args.response) : null;
  const outputHash = outputRaw
    ? createHash('sha256').update(outputRaw).digest('hex')
    : null;

  db.prepare(INSERT_SQL).run(
    trialId,
    args.key.modelId,
    args.context.provider,
    args.key.promptSha,
    args.key.staticHash,
    args.key.trialIndex,
    args.context.caseId,
    args.context.caseSlug,
    args.context.variantName,
    args.context.variantConfigId,
    args.context.createdInRunId,
    outputRaw,
    outputHash,
    args.telemetry.finishReason,
    args.telemetry.inputTokens,
    args.telemetry.outputTokens,
    args.telemetry.totalTokens,
    args.telemetry.cachedInputTokens,
    args.telemetry.estimatedCostUsd,
    args.telemetry.costNanoUsd,
    args.metadata.latencyMs,
    args.status,
    args.error,
    args.metadata.createdAt,
  );

  return trialId;
};
