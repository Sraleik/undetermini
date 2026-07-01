import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Middleware,
} from '@ai-sdk/provider';
import type Database from 'better-sqlite3';
import { buildKeyFromCallOptions } from './key-builder';
import { insertTrial, lookupTrial, type TrialContext } from './trial-cache';
import type { CacheEntry, CacheKey, CacheMode } from './types';

export type TrialCacheMiddlewareOptions = {
  mode: CacheMode;
  context: TrialContext;
  estimateCostUsd: (
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens?: number,
  ) => number | null;
  /** Inject a specific DB handle. Defaults to the singleton from `openEvalDb()`. */
  db?: Database.Database;
  /** Cache hit — `entry.trialId` is the UUID of the row that produced this response. */
  onHit?: (entry: CacheEntry) => void;
  /** Fresh successful call — `entry.trialId` is the UUID of the just-inserted row. */
  onMiss?: (entry: CacheEntry) => void;
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

    if (options.mode === 'auto') {
      const hit = lookupTrial(key, options.db);
      if (hit) {
        options.onHit?.(hit);
        return hit.response;
      }
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
    const stripped = stripForPersist(result);
    const inputTokens = result.usage.inputTokens?.total ?? 0;
    const outputTokens = result.usage.outputTokens?.total ?? 0;
    // Cached-prefix input tokens (OpenAI automatic prompt caching) — billed at
    // the discounted cachedInput rate so estimated_cost_usd reflects the REAL cost.
    const cachedInputTokens = result.usage.inputTokens?.cacheRead ?? 0;

    const trialId = insertTrial(
      {
        key,
        response: stripped,
        metadata: { createdAt: new Date().toISOString(), latencyMs },
        context: options.context,
        telemetry: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cachedInputTokens,
          estimatedCostUsd: options.estimateCostUsd(
            model.modelId,
            inputTokens,
            outputTokens,
            cachedInputTokens,
          ),
          finishReason: result.finishReason ? String(result.finishReason) : null,
        },
        status: 'success',
        error: null,
      },
      options.db,
    );

    const entry: CacheEntry = {
      trialId,
      key,
      metadata: { createdAt: new Date().toISOString(), latencyMs },
      response: stripped,
    };
    options.onMiss?.(entry);

    return result;
  },
});
