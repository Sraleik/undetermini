import React from 'react';
import type { EvalEngine } from '@eval/engine/api';
import type { EvalVariant } from '@eval/engine/variant';
import type { CacheMode } from '@eval/engine/cache';
import { App } from '../app';
import { parseSysPromptName } from '../components/VariantTable';
import type { DisplayOptions, WizardAction, WizardState } from '../store';

export type RunningPageProps = {
  engine: EvalEngine<EvalVariant>;
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  subjectName: string;
  maxConcurrency: number;
  cacheMode: CacheMode;
  runId: string;
  onComplete: () => void;
  onExit: () => void;
  onBack: () => void;
  onRerun: () => void;
  /** Persist display prefs edited live in the result view (best-effort). */
  onCommitDisplay?: (display: DisplayOptions) => void;
};

export const RunningPage: React.FC<RunningPageProps> = ({
  engine,
  state,
  dispatch,
  subjectName,
  maxConcurrency,
  cacheMode,
  runId,
  onComplete,
  onExit,
  onBack,
  onRerun,
  onCommitDisplay,
}) => {
  const variantDescriptors = state.selectedVariants.map((v) => ({
    name: v.name,
    modelId: v.modelId,
    sysPromptName: parseSysPromptName(v.name),
    reasoningEffort: v.provider === 'openai' ? v.reasoningEffort : undefined,
    thinkingBudgetTokens:
      v.provider === 'anthropic' ? v.thinkingBudgetTokens : undefined,
  }));

  return (
    <App
      engine={engine}
      runOpts={{
        trialCount: state.trialCount,
        maxConcurrency,
        cacheMode,
        runId,
      }}
      subjectName={subjectName}
      meta={{
        trialCount: state.trialCount,
        cases: state.selectedCases.length,
        variants: state.selectedVariants.length,
      }}
      caseSlugs={state.selectedCases.map((c) => c.slug)}
      caseInputsBySlug={
        new Map(state.selectedCases.map((c) => [c.slug, String(c.input)]))
      }
      variants={variantDescriptors}
      sortSpec={state.display.sort ?? []}
      initialDisplay={state.display}
      onCommitDisplay={onCommitDisplay}
      onRunComplete={(run) => {
        dispatch({ type: 'setRunResult', runResult: run });
        onComplete();
      }}
      onExitAction={(action) => {
        // App emits 'back' on b key, 'quit' on q. 'back' returns to the
        // wizard in place (Router resets the engine); 'quit' unmounts Ink.
        if (action === 'back') {
          onBack();
        } else if (action === 'quit') {
          onExit();
        }
      }}
      onRerun={onRerun}
    />
  );
};
