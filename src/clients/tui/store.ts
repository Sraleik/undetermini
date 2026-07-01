import type { EvalVariant } from '@eval/engine/variant';
import type { AxisInputs } from '@eval/engine/axes/axis-inputs';
import type { RunResult } from '@eval/engine/runner-loop';
import type { EvalCase } from '@eval/engine/types';
import type {
  ColKey,
  EvalCliArgs,
  SectionName,
  SortSpec,
} from '@eval/clients/cli/cli-args';

/**
 * Single source of truth for everything the wizard collects between launch and
 * the final `engine.run()` call. Each page reads what it needs and dispatches
 * back into this state — no per-page local state survives across navigation.
 *
 * `runResult` is filled post-run and consumed by `onRunFinished` (persist to
 * DB). The final table itself stays on screen via the still-mounted `App`,
 * which keeps its own completed-run state — no re-query, no separate page.
 */
export type DisplayOptions = {
  sections: Set<SectionName>;
  cols: Set<ColKey> | null;
  sort: SortSpec[] | null;
};

export type WizardState = {
  selectedCases: EvalCase[];
  axes: AxisInputs;
  selectedVariants: EvalVariant[];
  display: DisplayOptions;
  trialCount: number;
  runResult: RunResult | null;
};

export type WizardAction =
  | { type: 'setCases'; cases: EvalCase[] }
  | { type: 'setAxes'; axes: AxisInputs }
  | { type: 'setSelectedVariants'; variants: EvalVariant[] }
  | { type: 'setTrialCount'; trialCount: number }
  | { type: 'setRunResult'; runResult: RunResult }
  | { type: 'resetForRerun' }
  /** Replace the entire wizard state — used when the subject changes, so
   *  cases/variants/axes are re-derived from the newly selected subject. */
  | { type: 'reseed'; state: WizardState };

export const wizardReducer = (
  state: WizardState,
  action: WizardAction,
): WizardState => {
  switch (action.type) {
    case 'setCases':
      return { ...state, selectedCases: action.cases };
    case 'setAxes':
      return { ...state, axes: action.axes };
    case 'setSelectedVariants':
      return { ...state, selectedVariants: action.variants };
    case 'setTrialCount':
      return { ...state, trialCount: action.trialCount };
    case 'setRunResult':
      return { ...state, runResult: action.runResult };
    case 'resetForRerun':
      // Keep the user's prior choices (cases/axes/variants/display/trialCount)
      // — only the run output is cleared so RunningPage will trigger a new run.
      return { ...state, runResult: null };
    case 'reseed':
      // Subject switched: drop every prior selection and adopt the fresh seed
      // derived from the new subject's cases/variants.
      return action.state;
  }
};

/**
 * Initial state derived from the subject + CLI flags. Pre-fills are applied
 * here so each page can default-check the right options without re-deriving
 * the seed every render.
 */
export const initialWizardState = (
  subject: { cases: EvalCase[]; variants: ReadonlyArray<EvalVariant> },
  args: EvalCliArgs,
  /**
   * Persisted display prefs (XDG `kalent-eval/tui.json`), or null when none.
   * Precedence per field: explicit CLI flag > saved pref > built-in default.
   * `--cols`/`--sort` are explicit iff `args.{cols,sort}` is non-null;
   * `--sections` explicitness can't be inferred from args (always a Set), so
   * the caller passes `sectionsFromCli`.
   */
  saved?: DisplayOptions | null,
  sectionsFromCli?: boolean,
): WizardState => {
  const preselectedCases =
    args.caseSlugs === null
      ? subject.cases
      : subject.cases.filter((c) => args.caseSlugs!.includes(c.slug));
  return {
    selectedCases: preselectedCases,
    axes: {
      models: args.cartesian?.models ?? [],
      reasoningEfforts: args.cartesian?.reasoningEfforts ?? ['default'],
      thinkingBudgets: args.cartesian?.thinkingBudgets ?? ['default'],
      sysPrompts: ['default'],
    },
    selectedVariants: [],
    display: {
      sections:
        sectionsFromCli || !saved ? args.sections : saved.sections,
      cols: args.cols !== null ? args.cols : (saved?.cols ?? null),
      sort: args.sort !== null ? args.sort : (saved?.sort ?? null),
    },
    trialCount: args.trialCount,
    runResult: null,
  };
};
