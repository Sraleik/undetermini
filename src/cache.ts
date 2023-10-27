import loki from "lokijs";

type CacheData = {
  implementationId: string;
  accuracy: number;
  latency: number;
  cost: number;
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

  getImplementationRunResults(payload: {
    implementationId: string;
    inputId: string;
  }): CacheData[];
}

export class CacheLoki implements Cache {
  private executionResult;

  constructor() {
    const db = new loki("cache.db");
    this.executionResult = db.addCollection("execution-result");
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
    const { implementationId, input, accuracy, latency, cost } = payload;
    const runnedAt = new Date();

    this.executionResult.insert({
      implementationId,
      input,
      accuracy,
      latency,
      cost,
      runnedAt
    });
  }

  getImplementationRunResults(payload: {
    implementationId: string;
    inputId: string;
  }) {
    const results = this.executionResult.find({
      implementationId: payload.implementationId
    });
    return results as CacheData[];
  }
}

export const defaultCache = new CacheLoki() as Cache;
