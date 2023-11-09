import currency from "currency.js";
import { RunResult, RunResultRepository } from "./run-result.repository";
import { UsecaseImplementation } from "./usecase-implementation";
import {
  HideableColumn,
  ResultPresenter,
  SortableColumn
} from "./result-presenter";

export type MultipleRunResult = {
  name: string;
  averageCost: number;
  averageLatency: number;
  averageAccuracy: number;
  averageError: number;
  realCallCount: number;
  callFromCacheCount: number;
  resultsFullPrice: number;
  resultsCurrentPrice: number;
};

export class Undetermini {
  static async create(options?: {
    persistOnDisk?: boolean;
    filename?: string;
  }) {
    const persistOnDisk = options?.persistOnDisk || false;
    const runResultRepository = await RunResultRepository.create({
      persistOnDisk,
      filename: options?.filename
    });
    return new Undetermini(runResultRepository);
  }

  constructor(private runResultRepository: RunResultRepository) {}

  private computeMetrics(
    resResults: (RunResult & { accuracy: number; retrieveFromCache: boolean })[]
  ): {
    averageCost: number;
    averageLatency: number;
    averageAccuracy: number;
    averageError: number;
    realCallCount: number;
    callFromCacheCount: number;
    resultsFullPrice: number;
    resultsCurrentPrice: number;
  } {
    const total = resResults.reduce(
      (acc, result) => {
        const cost = currency(acc.cost, { precision: 10 }).add(
          result.cost
        ).value;

        return {
          cost,
          latency: acc.latency + result.latency,
          accuracy: acc.accuracy + result.accuracy,
          error: result.error ? acc.error + 1 : acc.error,
          realCallCount: result.retrieveFromCache
            ? acc.realCallCount
            : acc.realCallCount + 1,
          callFromCacheCount: result.retrieveFromCache
            ? acc.callFromCacheCount + 1
            : acc.callFromCacheCount,
          resultsFullPrice: cost,
          resultsCurrentPrice: result.retrieveFromCache
            ? acc.resultsCurrentPrice
            : currency(acc.resultsCurrentPrice, { precision: 10 }).add(
                result.cost
              ).value
        };
      },
      {
        cost: 0,
        latency: 0,
        accuracy: 0,
        error: 0,
        realCallCount: 0,
        callFromCacheCount: 0,
        resultsFullPrice: 0,
        resultsCurrentPrice: 0
      }
    );

    return {
      averageCost: currency(total.cost, { precision: 10 }).divide(
        resResults.length
      ).value,
      averageLatency: total.latency / resResults.length,
      averageAccuracy: total.accuracy / resResults.length,
      averageError: (total.error * 100) / resResults.length,
      realCallCount: total.realCallCount,
      callFromCacheCount: total.callFromCacheCount,
      resultsFullPrice: total.resultsFullPrice,
      resultsCurrentPrice: total.resultsCurrentPrice
    };
  }

  private evaluateAccuracyDefault(expectedOutput: any, output: any) {
    const expectedOutputType = typeof expectedOutput;
    const outputType = typeof output;

    if (expectedOutputType === "object" && outputType === "object") {
      let matchCount = 0;
      let totalKeys = 0;

      for (const key in expectedOutput) {
        totalKeys++;
        if (expectedOutput[key] === output[key]) {
          matchCount++;
        }
      }

      // Considering keys in responseJson that might not be in validJson
      for (const key in output) {
        if (!(key in expectedOutput)) {
          totalKeys++;
        }
      }

      return (matchCount / totalKeys) * 100;
    }
    return expectedOutput === output ? 100 : 0;
  }

  private async runImplementation(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
  }) {
    const { implementation, useCaseInput } = payload;

    const runnedAt = new Date();
    const {
      runId,
      implementationId,
      inputId,
      input,
      result,
      cost,
      latency,
      error
    } = await implementation.run({
      input: useCaseInput
    });

    await this.runResultRepository.addRunResult({
      runId,
      implementationId,
      inputId,
      name: implementation.name,
      input,
      result,
      cost,
      latency,
      error,
      runnedAt
    });
  }

  private async getEnoughImplementationResults(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    times?: number;
    useCache: boolean;
  }) {
    const { implementation, useCaseInput, times = 1, useCache } = payload;

    let runResultExistingCount = 0;
    const runId = implementation.getRunHash(useCaseInput);

    if (useCache) {
      runResultExistingCount =
        await this.runResultRepository.getRunResultsCount({
          runId
        });
    }

    const realCallNeeded =
      runResultExistingCount >= times ? 0 : times - runResultExistingCount;

    const runResultPromises: Promise<unknown>[] = [];

    for (let i = 0; i < realCallNeeded; i++) {
      runResultPromises.push(
        this.runImplementation({
          useCaseInput,
          implementation
        })
      );
    }

    await Promise.all(runResultPromises);

    //MAYBE: this function could return 'runId' instead of MultipleRunResult
    const neededResults = await this.runResultRepository.getLastRunResults({
      runId,
      limit: times
    });

    const resultWithAccuracy = {
      [implementation.name]: neededResults.map((runResult, index) => {
        return {
          ...runResult,
          retrieveFromCache: index >= realCallNeeded
        };
      })
    };
    return resultWithAccuracy;
  }

  async run(payload: {
    useCaseInput: any;
    implementations: UsecaseImplementation[];
    times?: number;
    useCache?: boolean;
    expectedUseCaseOutput?: unknown;
    evaluateAccuracy?: (output: any) => number;
    presenter?: {
      isActive: boolean;
      options?: {
        sortPriority?: SortableColumn[];
        hideColumns?: HideableColumn[];
      };
    };
  }) {
    const {
      implementations,
      useCaseInput,
      expectedUseCaseOutput,
      evaluateAccuracy: customAccuracyEvaluation,
      times = 1,
      useCache = false,
      presenter = { isActive: false }
    } = payload;

    if (!expectedUseCaseOutput && !customAccuracyEvaluation)
      throw new Error(
        "Undetermini need either expectedOutput or an evaluateAccuracy Function"
      );

    const evaluateAccuracy = customAccuracyEvaluation
      ? customAccuracyEvaluation
      : (output: any) => {
          return this.evaluateAccuracyDefault(expectedUseCaseOutput, output);
        };

    const promiseRuns = implementations.map((implementation) => {
      return this.getEnoughImplementationResults({
        useCaseInput,
        implementation,
        times,
        useCache
      });
    });

    const implementationsResults = await Promise.all(promiseRuns);

    const implementationsMetrics = implementationsResults.map(
      (implementationResults) => {
        const name = Object.keys(implementationResults)[0];
        const res1WithAccuracy = implementationResults[name].map(
          (runResult: RunResult & { retrieveFromCache: boolean }) => {
            return {
              ...runResult,
              accuracy: runResult.result
                ? evaluateAccuracy(runResult.result)
                : 100 // Accuracy is not impacted by errors
            };
          }
        );

        const metrics = this.computeMetrics(res1WithAccuracy);
        return { name, ...metrics };
      }
    );

    if (presenter.isActive) {
      const currentPresenter = new ResultPresenter(presenter.options);
      currentPresenter.addResults(implementationsMetrics);
      currentPresenter.displayResults(times);
    }

    return implementationsMetrics;
  }
}
