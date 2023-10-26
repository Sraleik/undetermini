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
    implementationId: string;
    accuracy: number;
    latency: number;
    cost: number;
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
    implementationId: string;
    accuracy: number;
    latency: number;
    cost: number;
  }) {
    const { implementationId, accuracy, latency, cost } = payload;
    const runnedAt = new Date();

    this.executionResult.insert({
      implementationId,
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
