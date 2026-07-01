import type { LanguageModelV3Middleware } from '@ai-sdk/provider';
import { buildKeyFromCallOptions } from '@eval/engine/cache/key-builder';

export type CapturedKey = {
  modelId: string;
  promptSha: string;
  staticHash: string;
};

/** Thrown after the cache key is computed, BEFORE the provider call. Lets the
 *  estimator learn the exact runtime cache key for a (variant, case) with zero
 *  network traffic and zero token cost. Caught by `resolvePlannedCacheKeys`. */
export class KeyCaptured extends Error {
  constructor(public readonly key: CapturedKey) {
    super('__KEY_CAPTURED__');
    this.name = 'KeyCaptured';
  }
}

/**
 * Innermost middleware (passed as the sole `extraMiddlewares` entry, so it sits
 * closest to the provider — same vantage point as `trialCacheMiddleware`). It
 * computes `buildKeyFromCallOptions` from the final params, writes the key into
 * `sink`, then throws `KeyCaptured` so `doGenerate()` is never invoked.
 */
export const keyCaptureMiddleware = (sink: {
  key?: CapturedKey;
}): LanguageModelV3Middleware => ({
  specificationVersion: 'v3',
  wrapGenerate: async ({ params, model }) => {
    const extracted = buildKeyFromCallOptions(model.modelId, params);
    sink.key = {
      modelId: model.modelId,
      promptSha: extracted.promptSha,
      staticHash: extracted.staticHash,
    };
    throw new KeyCaptured(sink.key);
  },
});
