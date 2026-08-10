import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { sha256 } from './hash';

/**
 * Split a `LanguageModelV3CallOptions` into its hashable components.
 *
 * - `systemPromptSha` — sha256 of all system messages concatenated (system prompt usually one msg).
 * - `promptSha` — sha256 of the non-system messages (user / assistant / tool turns).
 * - `schemaSha` — sha256 of `responseFormat` (for json mode) AND `tools` (for jsonTool mode).
 *   Both can carry the structured-output schema depending on the provider.
 * - `paramsSha` — sha256 of all sampling params + provider options. Excludes prompt, schema,
 *   abortSignal, headers (per-call HTTP detail, irrelevant to output).
 *
 * `staticHash` combines modelId + system + schema + params — the slot that stays stable across
 * all cases for a given config. Used as the second-level directory in the cache layout.
 */
export type ExtractedKey = {
  modelId: string;
  systemPromptSha: string;
  promptSha: string;
  schemaSha: string;
  paramsSha: string;
  staticHash: string;
};

export const buildKeyFromCallOptions = (
  modelId: string,
  params: LanguageModelV3CallOptions,
): ExtractedKey => {
  const systemMessages = params.prompt.filter((m) => m.role === 'system');
  const otherMessages = params.prompt.filter((m) => m.role !== 'system');

  const systemPromptSha = sha256(systemMessages);
  const promptSha = sha256(otherMessages);
  const schemaSha = sha256({
    responseFormat: params.responseFormat ?? null,
    tools: params.tools ?? null,
    toolChoice: params.toolChoice ?? null,
  });
  const paramsSha = sha256({
    maxOutputTokens: params.maxOutputTokens ?? null,
    temperature: params.temperature ?? null,
    topP: params.topP ?? null,
    topK: params.topK ?? null,
    presencePenalty: params.presencePenalty ?? null,
    frequencyPenalty: params.frequencyPenalty ?? null,
    stopSequences: params.stopSequences ?? null,
    seed: params.seed ?? null,
    providerOptions: params.providerOptions ?? null,
  });

  const staticHash = sha256({
    modelId,
    systemPromptSha,
    schemaSha,
    paramsSha,
  });

  return {
    modelId,
    systemPromptSha,
    promptSha,
    schemaSha,
    paramsSha,
    staticHash,
  };
};
