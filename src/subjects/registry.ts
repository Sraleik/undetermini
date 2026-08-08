/**
 * Subject registry — the composition root of the eval harness.
 *
 * This is the ONE place that knows which concrete subjects exist for this app.
 * The generic engine (`eval/src/engine/*`) never imports a subject; the runners
 * (CLI + TUI) never import a subject directly either — they go through
 * `resolveSubject(name)`. Adding a new use case = implement a `Subject`, then add
 * one line to `SUBJECTS` below. No runner edits.
 *
 * Each entry also carries the subject's `evalFile` / `casesDir` source paths,
 * which `writeRunToDb` stamps on every run row for traceability.
 */
import type { Subject, SubjectVariant } from '@eval/engine/runner-loop';
import {
  exampleSentimentSubject,
  EXAMPLE_SENTIMENT_EVAL_FILE,
  EXAMPLE_SENTIMENT_CASES_DIR,
} from '@eval/subjects/example-sentiment';

export const PROMPT_KIND = {
  BASELINE: 'baseline',
  ITERATION: 'iteration',
} as const;

export type PromptKind = (typeof PROMPT_KIND)[keyof typeof PROMPT_KIND];

/** A declared system-prompt experiment. `name` is the `--sys-prompts` token and
 *  the stem of a `*.md` file under the subject's `promptsDir`. Membership is
 *  structural — a prompt belongs to the subject whose list holds it — so there
 *  is no `subject` field to filter on and no way for one subject's lineage to
 *  leak into another's selector. */
export type RegisteredPrompt =
  | { name: string; kind: typeof PROMPT_KIND.BASELINE; description?: string }
  | {
      name: string;
      kind: typeof PROMPT_KIND.ITERATION;
      /** The prompt this one diverges from — the lineage link the selector
       *  walks transitively to decide what to show. */
      iteratesOn: string;
      description?: string;
    };

export const SCHEMA_KIND = {
  BASELINE: 'baseline',
  ABLATION: 'ablation',
  ITERATION: 'iteration',
} as const;

export type SchemaKind = (typeof SCHEMA_KIND)[keyof typeof SCHEMA_KIND];

type RegisteredSchemaBase<TSchema> = {
  /** CLI token and `sch-` segment of the variant name. */
  name: string;
  /** One-line description shown in the selector. */
  description: string;
  /** The concrete schema the subject injects into its own `runOne`. The harness
   *  never inspects it — it only ever displays the metadata above — which is why
   *  this is a type parameter and not a validator type. A host using zod passes
   *  `RegisteredSchema<z.ZodType>`; the harness takes no dependency on it. */
  schema: TSchema;
};

export type RegisteredSchema<TSchema = unknown> =
  | (RegisteredSchemaBase<TSchema> & { kind: typeof SCHEMA_KIND.BASELINE })
  | (RegisteredSchemaBase<TSchema> & {
      kind: typeof SCHEMA_KIND.ABLATION | typeof SCHEMA_KIND.ITERATION;
      iteratesOn: string;
    });

export type RegisteredSubject<TSchema = unknown> = {
  /** The subject under test. Typed loosely at the registry boundary: each
   *  subject narrows `EvalCase` generics internally, but the runner only touches
   *  `name` / `cases` / `variants` / `runOne`, which are variant-shape-stable.
   *  The `unknown` hop matches the existing TUI boundary cast. */
  subject: Subject<SubjectVariant>;
  /** Source path of the subject's `.eval.ts` / `.subject.ts`. */
  evalFile: string;
  /** Source path of the subject's cases. */
  casesDir: string;
  /** Directory holding this subject's `*.md` system-prompt files. Omit when the
   *  subject has no prompt library; the selector then offers only
   *  `default (baseline)`. */
  promptsDir?: string;
  /** This subject's prompt library. */
  prompts?: readonly RegisteredPrompt[];
  /** This subject's schema library. A schema shared by three subjects is listed
   *  in all three — the repetition is a reference, not a copy. */
  schemas?: readonly RegisteredSchema<TSchema>[];
};

export const SUBJECTS: Record<string, RegisteredSubject> = {
  example: {
    subject: exampleSentimentSubject as unknown as Subject<SubjectVariant>,
    evalFile: EXAMPLE_SENTIMENT_EVAL_FILE,
    casesDir: EXAMPLE_SENTIMENT_CASES_DIR,
  },
};

/** Default when `--subject` is omitted. The standalone harness ships the
 *  `example-sentiment` reference subject; add your own subject above and set it
 *  here to make it the default. */
export const DEFAULT_SUBJECT = 'example';

export const resolveSubject = (name: string): RegisteredSubject => {
  const entry = SUBJECTS[name];
  if (entry === undefined) {
    throw new Error(
      `Unknown --subject="${name}". Available: ${Object.keys(SUBJECTS).join(', ')}.`,
    );
  }
  return entry;
};
