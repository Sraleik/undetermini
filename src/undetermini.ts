import currency from "currency.js";
import { RunResult, RunResultRepository } from "./run-result.repository";
import { UsecaseImplementation } from "./usecase-implementation";
import { ResultPresenter } from "./result-presenter";

export type MultipleRunResult = {
  name: string;
  averageCost: number;
  averageLatency: number;
  averageAccuracy: number;
  numberOfRun?: number;
};

export class Undetermini {
  private runResultRepository: RunResultRepository;

  constructor(
    private persistResultOnDisk = false,
    private presenter = new ResultPresenter()
  ) {
    this.runResultRepository = this.persistResultOnDisk
      ? new RunResultRepository(true)
      : new RunResultRepository(false);
  }

  private computeAverages(resResults: RunResult[]): {
    averageCost: number;
    averageLatency: number;
    averageAccuracy: number;
  } {
    const total = resResults.reduce(
      (acc, result) => {
        return {
          cost: currency(acc.cost, { precision: 10 }).add(result.cost).value,
          latency: acc.latency + result.latency,
          accuracy: acc.accuracy + result.accuracy
        };
      },
      { cost: 0, latency: 0, accuracy: 0 }
    );

    return {
      averageCost: currency(total.cost, { precision: 10 }).divide(
        resResults.length
      ).value,
      averageLatency: total.latency / resResults.length,
      averageAccuracy: total.accuracy / resResults.length
    };
  }

  private async singleImplementationOnce(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    expectedUseCaseOutput: unknown;
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

    await this.runResultRepository.addRunResult({
      runId,
      implementationId,
      inputId,
      input,
      result,
      latency,
      accuracy,
      cost
    });
  }

  private async runImplementationMultipleTime(payload: {
    implementation: UsecaseImplementation;
    useCaseInput: unknown;
    expectedUseCaseOutput: Record<string, any>;
    times?: number;
    useCache: boolean;
  }) {
    const {
      implementation,
      useCaseInput,
      expectedUseCaseOutput,
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
          implementation,
          expectedUseCaseOutput
        })
      );
    }

    await Promise.all(runResultPromises);

    const neededResults = await this.runResultRepository.getLastRunResults({
      runId,
      limit: times
    });

    const averages = this.computeAverages(neededResults);

    const res = {
      ...averages,
      name: implementation.name
    };

    return res as MultipleRunResult;
  }

  async run(payload: {
    times?: number;
    useCache?: boolean;
    useCaseInput: any;
    implementations: UsecaseImplementation[];
    expectedUseCaseOutput: Record<string, any>;
    usePresenter?: boolean; //TODO this should be presenter options and the presenter should be instanciated here
  }) {
    const {
      implementations,
      useCaseInput,
      expectedUseCaseOutput,
      times = 1,
      useCache = false,
      usePresenter = false
    } = payload;

    const promiseRuns = implementations.map((implementation) => {
      return this.runImplementationMultipleTime({
        useCaseInput,
        implementation,
        expectedUseCaseOutput,
        times,
        useCache
      });
    });

    const results = await Promise.all(promiseRuns);

    if (usePresenter) this.presenter.displayResults({ data: results });

    return results;
  }
}
