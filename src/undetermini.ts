import { defaultCache } from "./cache";
import { UsecaseImplementation } from "./usecase-implementation";

export type ImplementationFunction<T> = (
  payload: T
) => Promise<{ result: any; costInCents?: number }>;

export type SingleRunResult = {
  latency: number;
  accuracy: number;
  cost: number;
};

export type MultipleRunResult = {
  name: string;
  averageLatency: number;
  averageAccuracy: number;
  averageCost: number;
};

export class Undetermini {
  constructor(private cacheClient = defaultCache) {}

  private async singleImplementationOnce(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    expectedUseCaseOutput: unknown;
    useCache: boolean;
  }) {
    const { implementation, useCaseInput, expectedUseCaseOutput } = payload;

    const { runId, implementationId, inputId, cost, accuracy, latency } =
      await implementation.run({
        input: useCaseInput,
        expectedOutput: expectedUseCaseOutput
      });

    this.cacheClient.addImplementationRunResult({
      runId,
      implementationId,
      inputId,
      latency,
      accuracy,
      cost
    });

    return { name: implementation.name, latency, accuracy, cost };
  }

  private async runImplementationMultipleTime(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    expectedUseCaseOutput: Record<string, any>;
    times: number;
    useCache: boolean;
  }) {
    const { implementation, useCaseInput, expectedUseCaseOutput, times } =
      payload;

    let totalLatency = 0;
    let totalAccuracy = 0;
    let totalCost = 0;

    for (let i = 0; i < (times || 1); i++) {
      const res = await this.singleImplementationOnce({
        useCaseInput,
        implementation,
        expectedUseCaseOutput,
        useCache: false
      });
      totalLatency += res.latency;
      totalAccuracy += res.accuracy;
      totalCost += res.cost;
    }

    const res = {
      name: implementation.name,
      averageLatency: totalLatency / times,
      averageAccuracy: totalAccuracy / times,
      averageCost: totalCost / times
    };

    return res;
  }

  // Run UseCases
  async run(payload: {
    times?: number;
    useCache?: boolean;
    useCaseInput: any;
    implementations: UsecaseImplementation[];
    expectedUseCaseOutput: Record<string, any>;
  }) {
    const {
      implementations,
      useCaseInput,
      expectedUseCaseOutput,
      times = 1,
      useCache = false
    } = payload;

    const promisePerModel = implementations.map((implementation) => {
      return this.runImplementationMultipleTime({
        useCaseInput,
        implementation,
        expectedUseCaseOutput,
        times,
        useCache
      });
    });

    const results = await Promise.all(promisePerModel);

    return results;
  }
}
