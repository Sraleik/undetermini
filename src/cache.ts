import loki from "lokijs";

export type CacheData = {
  runId: string;
  implementationId: string;
  inputId: string;
  accuracy: number;
  latency: number;
  cost: number;
  error: Error;
  runnedAt: Date;
};

export interface Cache {
  addImplementationRunResult(payload: {
    runId: string;
    implementationId: string;
    inputId: string;
    accuracy: number;
    latency: number;
    cost: number;
    error?: Error;
  }): void;

  getImplementationRunResults(payload: { runId: string }): CacheData[];
}

export class CacheLoki implements Cache {
  private db: loki;
  private executionResult: loki.Collection;

  constructor() {
    this.db = new loki("cache.json", {
      autoload: true,
      autoloadCallback: this.databaseInitialize.bind(this),
      autosave: false,
      throttledSaves: true
    });
    this.executionResult = this.db.getCollection("execution-results");
  }

  private databaseInitialize() {
    this.executionResult = this.db.getCollection("execution-results");
    if (this.executionResult === null) {
      this.executionResult = this.db.addCollection("execution-results");
      this.db.saveDatabase();
    }
  }

  addImplementationRunResult(payload: {
    runId: string;
    implementationId: string;
    inputId: string;
    input: any;
    accuracy: number;
    latency: number;
    cost: number;
    error?: Error;
  }) {
    const {
      runId,
      implementationId,
      inputId,
      input,
      accuracy,
      latency,
      cost,
      error
    } = payload;
    const runnedAt = new Date();

    this.executionResult.insert({
      runId,
      implementationId,
      inputId,
      input,
      accuracy,
      latency,
      cost,
      error,
      runnedAt
    });
    this.db.saveDatabase();
  }

  getImplementationRunResults(payload: { runId: string }) {
    const results = this.executionResult
      .find({
        runId: payload.runId
      })
      .map((lokiResult: any) => {
        return {
          runId: lokiResult.runId,
          implementationId: lokiResult.implementationId,
          inputId: lokiResult.inputId,
          accuracy: lokiResult.accuracy,
          latency: lokiResult.latency,
          cost: lokiResult.cost,
          error: lokiResult.error ? new Error(lokiResult.error) : undefined,
          runnedAt: new Date(lokiResult.runnedAt)
        };
      });
    return results as CacheData[];
  }
}

export const defaultCache = new CacheLoki() as Cache;
