import currency from "currency.js";
import { RunResult, RunResultRepository } from "./run-result.repository";
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
  private runResultRepository: RunResultRepository;

  constructor(private persistResultOnDisk = false) {
    this.runResultRepository = this.persistResultOnDisk
      ? new RunResultRepository(true)
      : new RunResultRepository(false);
  }

  private randomSelectionOfCacheResults(
    cachedData: RunResult[],
    numberToRetrieve: number
  ) {
    return cachedData
      .sort(() => 0.5 - Math.random())
      .slice(0, numberToRetrieve);
  }

  private async singleImplementationOnce(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    expectedUseCaseOutput: unknown;
    useCache: boolean;
  }) {
    const { implementation, useCaseInput, expectedUseCaseOutput } = payload;

    const {
      runId,
      implementationId,
      inputId,
      input,
      result,
      cost,
      accuracy,
      latency
    } = await implementation.run({
      input: useCaseInput,
      expectedOutput: expectedUseCaseOutput
    });

    this.runResultRepository.addRunResult({
      runId,
      implementationId,
      inputId,
      input,
      result,
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
    const {
      implementation,
      useCaseInput,
      expectedUseCaseOutput,
      times,
      useCache
    } = payload;

    let totalLatency = 0;
    let totalAccuracy = 0;
    let totalCost = 0;

    if (useCache) {
      const runId = await implementation.getRunHash(useCaseInput);
      const resultCachedForThisRun =
        await this.runResultRepository.getRunResults({
          runId
        });
      const cacheResultCount = resultCachedForThisRun.length;
      if (cacheResultCount >= times) {
        const cachedResult = this.randomSelectionOfCacheResults(
          resultCachedForThisRun,
          times
        );

        return cachedResult.reduce(
          (acc, cacheResult, currentIndex) => {
            acc.averageAccuracy = acc.averageAccuracy + cacheResult.accuracy;
            acc.averageLatency = acc.averageLatency + cacheResult.latency;
            acc.averageCost = currency(acc.averageCost, { precision: 10 }).add(
              currency(cacheResult.cost, { precision: 10 })
            ).value;

            if (currentIndex === cachedResult.length - 1) {
              acc.averageAccuracy = acc.averageAccuracy / (currentIndex + 1);
              acc.averageLatency = acc.averageLatency / (currentIndex + 1);
              acc.averageCost = currency(acc.averageCost, {
                precision: 10
              }).divide(currentIndex + 1).value;
            }

            return acc;
          },
          {
            name: implementation.name,
            averageLatency: 0,
            averageAccuracy: 0,
            averageCost: 0
          }
        );
      }
    }

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
