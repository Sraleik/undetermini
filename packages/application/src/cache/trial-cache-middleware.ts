import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Middleware,
} from '@ai-sdk/provider';
import type Database from 'better-sqlite3';
import { buildKeyFromCallOptions } from '@undetermini/core/cache/key-builder';
import {
  insertTrial,
  lookupTrial,
  replayCostNanoUsd,
  type TrialContext,
} from './trial-cache';
import type { CacheEntry, CacheKey, CacheMode } from '@undetermini/core/cache/types';
import type { PricePeriod } from '@undetermini/core/models/model';
import { trialCost } from '@undetermini/core/models/price';

/** A cache entry with the cost it carries: stored for a hit, declared for a fresh call. */
export type PricedCacheEntry = CacheEntry & { costNanoUsd: number | null };

/** A retired model has no stored answer for this trial, and it never calls the provider. */
export class UnavailableTrialError extends Error {
  constructor(modelId: string) {
    super(`Modèle retiré « ${modelId} » : aucun essai en base pour ce cas`);
    this.name = 'UnavailableTrialError';
  }
}

export type TrialCacheMiddlewareOptions = {
  mode: CacheMode;
  context: TrialContext;
  /** Declared price periods of the model; empty or absent = unknown price, cost `null`. */
  pricePeriods?: PricePeriod[];
  /** Retired model: replays stored trials in any mode, never calls the provider. */
  retired?: boolean;
  /** Inject a specific DB handle. Defaults to the singleton from `openEvalDb()`. */
  db?: Database.Database;
  /** Cache hit — `entry.trialId` is the UUID of the row that produced this response. */
  onHit?: (entry: PricedCacheEntry) => void;
  /** Fresh successful call — `entry.trialId` is the UUID of the just-inserted row. */
  onMiss?: (entry: PricedCacheEntry) => void;
  /** Retired model, no stored trial: nothing was called, nothing was written. */
  onUnavailable?: () => void;
  /** Fresh failed call — `trialId` is the UUID of the inserted `status='fail'` row. */
  onFail?: (trialId: string, error: Error) => void;
};

const stripForPersist = (
  result: LanguageModelV3GenerateResult,
): LanguageModelV3GenerateResult => {
  const { request, response, ...rest } = result;
  return {
    ...rest,
    ...(request ? { request: {} } : {}),
    ...(response
      ? {
          response: {
            id: response.id,
            timestamp: response.timestamp,
            modelId: response.modelId,
            headers: response.headers,
          } as LanguageModelV3GenerateResult['response'],
        }
      : {}),
  };
};

export const trialCacheMiddleware = (
  options: TrialCacheMiddlewareOptions,
): LanguageModelV3Middleware => ({
  specificationVersion: 'v3',
  wrapGenerate: async ({ doGenerate, params, model }) => {
    const extracted = buildKeyFromCallOptions(model.modelId, params);
    const key: CacheKey = { ...extracted, trialIndex: options.context.trialIndex };

    const periods = options.pricePeriods ?? [];

    if (options.mode === 'auto' || options.retired) {
      const hit = lookupTrial(key, options.context.provider, options.db);
      if (hit) {
        const { stored, ...entry } = hit;
        options.onHit?.({
          ...entry,
          costNanoUsd: replayCostNanoUsd({ stored, periods }),
        });
        return hit.response;
      }
    }

    if (options.retired) {
      options.onUnavailable?.();
      throw new UnavailableTrialError(model.modelId);
    }

    const start = performance.now();
    let result: LanguageModelV3GenerateResult;
    try {
      result = await doGenerate();
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err : new Error(String(err));
      const trialId = insertTrial(
        {
          key,
          response: {} as LanguageModelV3GenerateResult,
          metadata: { createdAt: new Date().toISOString(), latencyMs },
          context: options.context,
          telemetry: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedInputTokens: 0,
            estimatedCostUsd: null,
            costNanoUsd: null,
            finishReason: null,
          },
          status: 'fail',
          error: error.message,
        },
        options.db,
      );
      options.onFail?.(trialId, error);
      throw err;
    }

    const latencyMs = Math.round(performance.now() - start);
    const createdAt = new Date().toISOString();
    const stripped = stripForPersist(result);
    const inputTokens = result.usage.inputTokens?.total ?? 0;
    const outputTokens = result.usage.outputTokens?.total ?? 0;
    // Cached-prefix input tokens (OpenAI automatic prompt caching) — billed at
    // the discounted cachedInput rate so the cost reflects the REAL cost.
    const cachedInputTokens = result.usage.inputTokens?.cacheRead ?? 0;
    const costNanoUsd = trialCost({
      periods,
      calledAt: createdAt.slice(0, 10),
      inputTokens,
      outputTokens,
      cachedInputTokens,
    });

    const trialId = insertTrial(
      {
        key,
        response: stripped,
        metadata: { createdAt, latencyMs },
        context: options.context,
        telemetry: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cachedInputTokens,
          estimatedCostUsd: costNanoUsd === null ? null : costNanoUsd / 1e9,
          costNanoUsd,
          finishReason: result.finishReason ? String(result.finishReason) : null,
        },
        status: 'success',
        error: null,
      },
      options.db,
    );

    const entry: PricedCacheEntry = {
      trialId,
      key,
      metadata: { createdAt, latencyMs },
      response: stripped,
      costNanoUsd,
    };
    options.onMiss?.(entry);

    return result;
  },
});
