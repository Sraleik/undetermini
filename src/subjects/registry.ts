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

export type RegisteredSubject = {
  /** The subject under test. Typed loosely at the registry boundary: each
   *  subject narrows `EvalCase` generics internally, but the runner only touches
   *  `name` / `cases` / `variants` / `runOne`, which are variant-shape-stable.
   *  The `unknown` hop matches the existing TUI boundary cast. */
  subject: Subject<SubjectVariant>;
  /** Source path of the subject's `.eval.ts` / `.subject.ts`. */
  evalFile: string;
  /** Source path of the subject's cases. */
  casesDir: string;
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
