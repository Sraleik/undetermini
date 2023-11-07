import currency from "currency.js";
import { RunResult, RunResultRepository } from "./run-result.repository";
import { UsecaseImplementation } from "./usecase-implementation";
import { ResultPresenter } from "./result-presenter";
import dotenv from "dotenv";
dotenv.config();

export type MultipleRunResult = {
  name: string;
  averageCost: number;
  averageLatency: number;
  averageAccuracy: number;
  averageError: number;
  numberOfRun?: number;
};

export class Undetermini {
  static async create(options?: { persistOnDisk: boolean }) {
    const persistOnDisk = options?.persistOnDisk || false;
    const runResultRepository = await RunResultRepository.create({
      persistOnDisk
    });
    return new Undetermini(runResultRepository);
  }

  private constructor(private runResultRepository: RunResultRepository) {}

  private computeAverages(resResults: (RunResult & { accuracy: number })[]): {
    averageCost: number;
    averageLatency: number;
    averageAccuracy: number;
    averageError: number;
  } {
    const total = resResults.reduce(
      (acc, result) => {
        return {
          cost: currency(acc.cost, { precision: 10 }).add(result.cost).value,
          latency: acc.latency + result.latency,
          accuracy: acc.accuracy + result.accuracy,
          error: result.error ? acc.error + 1 : acc.error
        };
      },
      { cost: 0, latency: 0, accuracy: 0, error: 0 }
    );

    return {
      averageCost: currency(total.cost, { precision: 10 }).divide(
        resResults.length
      ).value,
      averageLatency: total.latency / resResults.length,
      averageAccuracy: total.accuracy / resResults.length,
      averageError: (total.error * 100) / resResults.length
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

  private async singleImplementationOnce(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
  }) {
    const { implementation, useCaseInput } = payload;

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
      input,
      result,
      latency,
      cost,
      error
    });
  }

  private async runImplementationMultipleTime(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    evaluateAccuracy: (output: any) => number;
    times?: number;
    useCache: boolean;
  }) {
    const {
      implementation,
      useCaseInput,
      evaluateAccuracy,
      times = 1,
      useCache
    } = payload;

    let runResultExistingCount = 0;
    const runId = await implementation.getRunHash(useCaseInput);

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
        this.singleImplementationOnce({
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

    const resultWithAccuracy = neededResults.map((runResult) => {
      return {
        ...runResult,
        accuracy: runResult.result ? evaluateAccuracy(runResult.result) : 100, // Accuracy is not impacted by errors
        error: runResult.error
      };
    });

    const averages = this.computeAverages(resultWithAccuracy);

    const res = {
      ...averages,
      name: implementation.name
    };

    return res as MultipleRunResult;
  }

  async run(payload: {
    useCaseInput: any;
    implementations: UsecaseImplementation[];
    times?: number;
    useCache?: boolean;
    expectedUseCaseOutput?: Record<string, any>;
    evaluateAccuracy?: (output: any) => number;
    //TODO make the presenter a real presenter : 2 mode JSON or Table
    presenter?: { isActive: boolean; options?: { sortPriority?: string[] } };
  }) {
    const {
      implementations,
      useCaseInput,
      expectedUseCaseOutput,
      evaluateAccuracy,
      times = 1,
      useCache = false,
      presenter = { isActive: false }
    } = payload;

    if (!expectedUseCaseOutput && !evaluateAccuracy)
      throw new Error(
        "Undetermini need either expectedOutput or an evaluateAccuracy Function"
      );

    const promiseRuns = implementations.map((implementation) => {
      return this.runImplementationMultipleTime({
        useCaseInput,
        implementation,
        evaluateAccuracy: evaluateAccuracy
          ? evaluateAccuracy
          : (output: any) => {
              return this.evaluateAccuracyDefault(
                expectedUseCaseOutput,
                output
              );
            },

        times,
        useCache
      });
    });

    const results = await Promise.all(promiseRuns);

    if (presenter.isActive) {
      const currentPresenter = new ResultPresenter(presenter.options);
      currentPresenter.addResults(results);
      currentPresenter.displayResults(times);
    }

    return results;
  }
}
