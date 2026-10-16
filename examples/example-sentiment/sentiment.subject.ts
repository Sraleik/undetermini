/**
 * EXAMPLE SUBJECT — sentiment classification.
 *
 * A deliberately tiny, NON-talent subject. It exists to PROVE the eval harness
 * is subject-agnostic and to serve as the copy-me template for a new use case
 * (see eval/ONBOARDING.md → "Add a new subject"). It classifies a sentence as
 * 'positive' | 'negative' | 'neutral' with a single LLM call.
 *
 * Run it:
 *   npm run eval -- --subject=example --trial-count=3
 *
 * Anatomy mirrors the talent subject (natural-language-filter.service.eval.ts):
 *   - runOne: wrap the model with telemetryMiddleware(sink) FIRST, then the
 *     caller's extraMiddlewares (cache), call the LLM, return { output, telemetry }.
 *   - parse: reconstruct TOutput from a stored generate result (for rescore).
 *   - buildProviderOptions: translate variant.setting → provider blob.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, wrapLanguageModel } from 'ai';
import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Middleware,
} from '@ai-sdk/provider';
import type { Subject } from '@undetermini/application/runner-loop';
import type { ModelVariant } from '@undetermini/core/models/variant';
import type { CallTelemetry, TelemetrySink } from '@undetermini/application/telemetry-middleware';
import { telemetryMiddleware } from '@undetermini/application/telemetry-middleware';
import { exampleSentimentCases } from './cases';

export type Sentiment = 'positive' | 'negative' | 'neutral';

/** The settings this subject understands; the project types them, the lib never reads them. */
export type SentimentSetting = { reasoningEffort: string };

export type SentimentVariant = ModelVariant<SentimentSetting>;

const openai = createOpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

/** One client per provider this subject serves. Any other provider is an error, never a fallback. */
export const clientFor = (provider: string) => {
  if (provider === 'openai') return openai;
  throw new Error(
    `Example — Sentiment ne sert pas le fournisseur "${provider}" : seul "openai" est branché.`,
  );
};

/** Translate `variant.setting` into the options blob of the variant's provider. */
export const buildProviderOptions = (
  variant: SentimentVariant,
): Record<string, unknown> | undefined => {
  clientFor(variant.provider);
  if (variant.setting === undefined) return undefined;
  return { openai: { reasoningEffort: variant.setting.reasoningEffort } };
};

const SYSTEM_PROMPT = [
  'You are a sentiment classifier.',
  'Read the user message and reply with EXACTLY ONE word, lowercase:',
  '"positive", "negative", or "neutral". No punctuation, no explanation.',
].join(' ');

/** Map a raw model string to a Sentiment label. Tolerant: lowercases, trims,
 *  and matches the first known label found — anything else falls back to
 *  'neutral' (so a chatty model never crashes the run). */
const toSentiment = (raw: string): Sentiment => {
  const t = raw.toLowerCase();
  if (t.includes('positive')) return 'positive';
  if (t.includes('negative')) return 'negative';
  return 'neutral';
};

const textOf = (raw: LanguageModelV3GenerateResult): string => {
  for (const part of raw.content) {
    if (part.type === 'text') return part.text;
  }
  return '';
};

const runOne = async ({
  input,
  variant,
  extraMiddlewares = [],
}: {
  input: string;
  variant: SentimentVariant;
  extraMiddlewares?: LanguageModelV3Middleware[];
}): Promise<{ output: Sentiment; telemetry: CallTelemetry }> => {
  const sink: TelemetrySink = { value: null };
  // telemetry OUTERMOST so cache-hit lookups stay observable, then the caller's
  // cache middleware — same ordering as the talent subject.
  const model = wrapLanguageModel({
    model: clientFor(variant.provider)(variant.modelId),
    middleware: [telemetryMiddleware(sink), ...extraMiddlewares],
  });

  // Per-variant override: if the variant declares its own systemPrompt, use it
  // for the call AND the hash (prepareVariantConfigs already folded it into
  // variant_config_id via `variant.systemPrompt ?? subject.systemPrompt`).
  // Mirrors the talent subject — keeps this copy-me template correct.
  const effectiveSystemPrompt = variant.systemPrompt ?? SYSTEM_PROMPT;

  const { text } = await generateText({
    model,
    system: effectiveSystemPrompt,
    prompt: input,
  });

  if (sink.value === null) {
    throw new Error(
      'telemetry sink not populated — middleware chain misconfigured',
    );
  }
  return { output: toSentiment(text), telemetry: sink.value };
};

const parse = (raw: unknown): Sentiment =>
  toSentiment(textOf(raw as LanguageModelV3GenerateResult));

export const exampleSentimentSubject: Subject<SentimentVariant, string, Sentiment> = {
  name: 'Example — Sentiment',
  systemPrompt: SYSTEM_PROMPT,
  cases: exampleSentimentCases,
  variants: [
    { name: 'gpt-4o-mini', provider: 'openai', modelId: 'gpt-4o-mini' },
    { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
  ],
  runOne,
  parse,
  buildProviderOptions,
};

/** Source-tree paths stamped on each run row (traceability), mirroring the
 *  talent subject's EVAL_FILE / EVAL_CASES_DIR. */
export const EXAMPLE_SENTIMENT_EVAL_FILE =
  'examples/example-sentiment/sentiment.subject.ts';
export const EXAMPLE_SENTIMENT_CASES_DIR =
  'examples/example-sentiment';
