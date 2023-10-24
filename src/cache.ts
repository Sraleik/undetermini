import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

type CacheData = {
  implementationsRunResult: Record<
    string,
    {
      accuracy: number;
      latency: number;
      cost: number;
      runnedAt: Date;
    }[]
  >;
};

class Cache {
  constructor(
    private db = new LowSync(new JSONFileSync<CacheData>("cache.json"), {
      implementationsRunResult: {}
    })
  ) {
    this.db.read();
  }

  addImplementationRunResult(payload: {
    implementationId: string;
    accuracy: number;
    latency: number;
    cost: number;
  }) {
    const { implementationId, accuracy, latency, cost } = payload;
    const runnedAt = new Date();

    const hasAlreadyARunResultCached =
      this.db.data.implementationsRunResult[implementationId];

    if (hasAlreadyARunResultCached) {
      this.db.data.implementationsRunResult[implementationId].push({
        accuracy,
        latency,
        cost,
        runnedAt
      });
    } else {
      this.db.data.implementationsRunResult[implementationId] = [
        {
          accuracy,
          latency,
          cost,
          runnedAt
        }
      ];
    }
    this.db.write();
  }

  getImplementationRunResults(payload: {
    implementationId: string;
    inputId: string;
  }) {
    return this.db.data.implementationsRunResult[payload.implementationId];
  }
}

export const defaultCache = new Cache();
