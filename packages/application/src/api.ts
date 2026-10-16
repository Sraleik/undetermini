import { EventEmitter } from 'node:events';
import type { Catalog } from '@undetermini/core/models/catalog';
import type { EvalEvent } from './event';
import {
  runEval,
  type RunOpts,
  type RunResult,
  type Subject,
  type SubjectVariant,
} from './runner-loop';

export class EvalEngine<
  V extends SubjectVariant = SubjectVariant,
  TInput = unknown,
  TOutput = unknown,
> {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly dependencies: {
      subject: Subject<V, TInput, TOutput>;
      /** Declared models: the only source of prices and retirement. */
      catalog: Catalog;
    },
  ) {}

  on(handler: (event: EvalEvent) => void): () => void {
    this.emitter.on('event', handler);
    return () => {
      this.emitter.off('event', handler);
    };
  }

  async run(opts: RunOpts): Promise<RunResult> {
    const { subject, catalog } = this.dependencies;

    this._emit({
      kind: 'runStarted',
      runId: opts.runId,
      startedAtMs: Date.now(),
      variantCount: subject.variants.length,
      caseCount: subject.cases.length,
      trialCount: opts.trialCount,
    });

    let result: RunResult;
    try {
      result = await runEval(
        subject,
        opts,
        (payload) => {
          this._emit({ kind: 'trialCompleted', runId: opts.runId, ...payload });
        },
        catalog,
      );
    } catch (err) {
      this._emit({
        kind: 'error',
        runId: opts.runId,
        scope: 'run',
        code: err instanceof Error ? err.name : 'UnknownError',
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this._emit({
      kind: 'runCompleted',
      runId: opts.runId,
      result,
    });

    return result;
  }

  private _emit(event: EvalEvent): void {
    this.emitter.emit('event', event);
  }
}
