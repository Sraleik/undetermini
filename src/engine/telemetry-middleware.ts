import type { LanguageModelV3Middleware } from '@ai-sdk/provider';

export type CallTelemetry = {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Subset of inputTokens served from the provider's prompt cache (OpenAI
   *  automatic prefix caching / Anthropic cache-read). Billed at the discounted
   *  cachedInput rate. 0 when the provider reports no cache hit. */
  cachedInputTokens: number;
};

export type TelemetrySink = { value: CallTelemetry | null };

// Place outermost so cache-hit lookup time stays observable. On cache hit,
// `usage` is the original call's tokens (cost stays meaningful "as if fresh").
export const telemetryMiddleware = (
  sink: TelemetrySink,
): LanguageModelV3Middleware => ({
  specificationVersion: 'v3',
  wrapGenerate: async ({ doGenerate }) => {
    const start = performance.now();
    const result = await doGenerate();
    const latencyMs = Math.round(performance.now() - start);
    const inputTokens = result.usage.inputTokens?.total ?? 0;
    const outputTokens = result.usage.outputTokens?.total ?? 0;
    // AI SDK v6 / provider V3: cached-prefix input tokens live at
    // `usage.inputTokens.cacheRead` (confirmed against @ai-sdk/provider's
    // LanguageModelV3Usage). 0 when the provider reports no cache hit.
    const cachedInputTokens = result.usage.inputTokens?.cacheRead ?? 0;
    sink.value = {
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedInputTokens,
    };
    return result;
  },
});
