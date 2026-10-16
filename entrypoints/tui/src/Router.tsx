import type { Catalog } from '@undetermini/core/models/catalog';
import type { ModelVariant } from '@undetermini/core/models/variant';
import type { EvalCliArgs } from '@undetermini/cli/cli-args';
import { EvalEngine } from '@undetermini/application/api';
import type { Subject } from '@undetermini/application/runner-loop';
import type { RegisteredSubject } from '@undetermini/application/subjects/registry';
import { Box, Text } from 'ink';
import React, { useEffect, useReducer, useState } from 'react';
import { AxesPage } from './pages/AxesPage';
import { CasesPage } from './pages/CasesPage';
import { ConfirmPage } from './pages/ConfirmPage';
import { RunningPage } from './pages/RunningPage';
import { SubjectPage } from './pages/SubjectPage';
import { VariantsPage } from './pages/VariantsPage';
import {
  initialWizardState,
  wizardReducer,
  type DisplayOptions,
  type WizardState,
} from './store';

export type Page =
  | 'subject'
  | 'cases'
  | 'axes'
  | 'variants'
  | 'confirm'
  | 'running';

export type RouterProps = {
  /** Every registered subject — the SubjectPage picker lists these, and the
   *  selected one drives the rest of the wizard. */
  subjects: Record<string, RegisteredSubject>;
  /** Subject active on launch (CLI `--subject` or the registry default). Seeds
   *  both the picker's focus and the initial wizard state. */
  initialSubjectName: string;
  args: EvalCliArgs;
  /** The models the project declares: offered by the axes step, priced by the
   *  cost estimate and by the engine. */
  catalog: Catalog;
  /**
   * Called once `engine.run()` resolves with a final RunResult. The parent
   * (runner.ts) is responsible for persisting via `writeRunToDb` and any
   * extra-Ink side effects. Keeping persistence out of the Router preserves
   * the "engine isolated from React" boundary. The second argument is the
   * subject the run was actually executed against (may differ from launch).
   */
  onRunFinished?: (
    state: WizardState,
    registered: RegisteredSubject,
  ) => void | Promise<void>;
  /**
   * Called when the user quits cleanly (q on CasesPage). Lets runner.ts
   * unmount Ink without process.exit() so cleanup runs.
   */
  onQuit: () => void;
  /** Persisted display prefs (XDG), or null. Seeds the wizard's display. */
  savedDisplay?: DisplayOptions | null;
  /** Whether `--sections` was passed explicitly on the CLI. */
  sectionsFromCli?: boolean;
  /** Persist the user's committed display options (best-effort). */
  onCommitDisplay?: (display: DisplayOptions) => void;
};

// The wizard builds `ModelVariant`s whatever the subject: cast each registered
// subject through `unknown` at this single boundary.
const asEvalSubject = (r: RegisteredSubject): Subject<ModelVariant> =>
  r.subject as unknown as Subject<ModelVariant>;

export const Router: React.FC<RouterProps> = ({
  subjects,
  initialSubjectName,
  args,
  catalog,
  onRunFinished,
  onQuit,
  savedDisplay,
  sectionsFromCli,
  onCommitDisplay,
}) => {
  const [subjectName, setSubjectName] = useState(initialSubjectName);
  const registered = subjects[subjectName];
  const subject = asEvalSubject(registered);

  const [state, dispatch] = useReducer(
    wizardReducer,
    initialWizardState(subject, args, savedDisplay, sectionsFromCli),
  );
  const [page, setPage] = useState<Page>('subject');
  const [engine, setEngine] = useState<EvalEngine<ModelVariant> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  // Adopt a newly picked subject: re-seed the wizard from its cases/variants,
  // then advance into the cases step.
  const handleSelectSubject = (name: string) => {
    setSubjectName(name);
    const nextSubject = asEvalSubject(subjects[name]);
    dispatch({
      type: 'reseed',
      state: initialWizardState(
        nextSubject,
        args,
        savedDisplay,
        sectionsFromCli,
      ),
    });
    setPage('cases');
  };

  // Return to the wizard (cases page) in place, without unmounting Ink.
  // Shared by 'back' (b key) and 'rerun' (r key) from the running/results page.
  const returnToWizard = () => {
    setEngine(null);
    setRunId(null);
    dispatch({ type: 'resetForRerun' });
    setPage('cases');
  };

  useEffect(() => {
    if (page !== 'running' || engine !== null) return;
    // Build the engine when transitioning into the running page.
    // RunningPage drives `engine.run()` itself (preserving the existing App's
    // event-subscribe-then-run lifecycle); Router only owns construction +
    // result wiring back into the wizard state.
    const subjectForRun = {
      ...subject,
      cases: state.selectedCases,
      variants: state.selectedVariants,
    };
    setEngine(new EvalEngine({ subject: subjectForRun, catalog }));
    const startedAt = new Date().toISOString();
    setRunId(`${startedAt.replace(/[:.]/g, '-')}__tui`);
  }, [page, engine, state, subject, catalog]);

  switch (page) {
    case 'subject':
      return (
        <SubjectPage
          subjects={subjects}
          currentSubjectName={subjectName}
          onSelect={handleSelectSubject}
          onQuit={onQuit}
        />
      );
    case 'cases':
      return (
        <CasesPage
          allCases={subject.cases}
          state={state}
          dispatch={dispatch}
          onNext={() => setPage('axes')}
          onBack={() => setPage('subject')}
          onQuit={onQuit}
        />
      );
    case 'axes':
      return (
        <AxesPage
          models={catalog.models}
          promptsDir={registered.promptsDir}
          prompts={registered.prompts ?? []}
          schemas={registered.schemas ?? []}
          state={state}
          dispatch={dispatch}
          onNext={() => setPage('variants')}
          onBack={() => setPage('cases')}
        />
      );
    case 'variants':
      return (
        <VariantsPage
          state={state}
          dispatch={dispatch}
          onNext={() => setPage('confirm')}
          onBack={() => setPage('axes')}
        />
      );
    case 'confirm':
      return (
        <ConfirmPage
          state={state}
          dispatch={dispatch}
          subject={subject}
          catalog={catalog}
          onProceed={() => setPage('running')}
          onBack={() => setPage('variants')}
        />
      );
    case 'running':
      if (engine === null || runId === null) {
        return (
          <Box flexDirection="column">
            <Text>Running eval — initializing engine...</Text>
          </Box>
        );
      }
      return (
        <RunningPage
          engine={engine}
          state={state}
          dispatch={dispatch}
          subjectName={subject.name}
          maxConcurrency={args.maxConcurrency}
          cacheMode={args.cacheMode}
          runId={runId}
          onCommitDisplay={onCommitDisplay}
          onComplete={() => {
            // Stay on this page: App is designed to remain mounted and fully
            // interactive after the run (sort/filter/columns + "✓ Run
            // complete." + footer). Switching to a separate page lost that.
            onRunFinished?.(state, registered);
          }}
          onExit={onQuit}
          onBack={returnToWizard}
          onRerun={returnToWizard}
        />
      );
  }
};
