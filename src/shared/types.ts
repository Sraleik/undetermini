import type { RunResult, TrialResult } from '@eval/engine/runner-loop';

export type { RunResult, TrialResult };

export type RunStartedEvent = {
  kind: 'runStarted';
  runId: string;
  startedAtMs: number;
  variantCount: number;
  caseCount: number;
  trialCount: number;
};

export type TrialCompletedEvent = {
  kind: 'trialCompleted';
  runId: string;
  variantName: string;
  caseSlug: string;
  trialIndex: number;
  trial: TrialResult;
};

/** Engine-internal payload — the shape `runEval`'s `onTrialCompleted` callback
 *  receives. The `EvalEngine` layer adds `kind` + `runId` to produce the wire
 *  `TrialCompletedEvent`. Single source of truth: any field added to the event
 *  flows through here automatically. */
export type TrialCompletedPayload = Omit<TrialCompletedEvent, 'kind' | 'runId'>;

export type RunCompletedEvent = {
  kind: 'runCompleted';
  runId: string;
  result: RunResult;
};

export type ErrorEvent = {
  kind: 'error';
  runId: string;
  scope: 'run' | 'subject';
  code: string;
  message: string;
};

export type EvalEvent =
  | RunStartedEvent
  | TrialCompletedEvent
  | RunCompletedEvent
  | ErrorEvent;

/** Structural subset of `EvalEngine` that consumers (clients) depend on.
 *  Decouples client code from the generic class — an `EvalEngine<EvalVariant, ...>`
 *  isn't directly assignable to `EvalEngine<SubjectVariant, ...>` despite
 *  covariant variants, but both satisfy this shape. */
export type EventSubscribable = {
  on: (handler: (event: EvalEvent) => void) => () => void;
};
