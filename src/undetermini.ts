export type UseCaseFunction<T> = (
  payload: T,
  handleCost?: (cost: number) => unknown
) => Promise<Record<string, any>>;
export type Output = Record<string, any>;
export type MultipleRunResult = {
  name: string;
  averageLatency: number;
  averageAccuracy: number;
  averageCost: number;
};

export class Undetermini {
  constructor() {}

  private computeAccuracyDefault(expectedOutput: Output, output: Output) {
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

  private async singleRun<T>(payload: {
    useCase: UseCaseFunction<T>;
    useCaseInput: T;
    expectedUseCaseOutput: Output;
  }) {
    const { useCase, useCaseInput, expectedUseCaseOutput } = payload;

    let costOfThisRun = 0;
    const startTime = Date.now();
    const output = await useCase(useCaseInput, async (cost: number) => {
      costOfThisRun = cost;
    });
    const endTime = Date.now();

    const latency = endTime - startTime;
    const accuracy = this.computeAccuracyDefault(expectedUseCaseOutput, output);
    return { latency, accuracy, cost: costOfThisRun };
  }

  async runUseCaseMultipleTime<T = any>(payload: {
    useCaseInput: T;
    useCase: { name: string; execute: UseCaseFunction<T> };
    expectedUseCaseOutput: Record<string, any>;
    times?: number;
  }) {
    const { useCase, useCaseInput, expectedUseCaseOutput, times } = payload;

    let totalLatency = 0;
    let totalAccuracy = 0;
    let totalCost = 0;

    for (let i = 0; i < (times || 1); i++) {
      const res = await this.singleRun<T>({
        useCaseInput,
        useCase: useCase.execute,
        expectedUseCaseOutput
      });
      totalLatency += res.latency;
      totalAccuracy += res.accuracy;
      totalCost += res.cost;
    }
    const averageLatency = totalLatency / (times || 1);
    const averageAccuracy = totalAccuracy / (times || 1);
    const averageCost = totalCost / (times || 1);

    return {
      name: useCase.name,
      averageLatency,
      averageAccuracy,
      averageCost
    } as MultipleRunResult;
  }

  // Run UseCases
  async run<T = any>(payload: {
    useCaseInput: T;
    useCases: { name: string; execute: UseCaseFunction<T> }[];
    expectedUseCaseOutput: Record<string, any>;
    times?: number;
  }) {
    const { useCases, useCaseInput, expectedUseCaseOutput, times } = payload;

    const results: MultipleRunResult[] = [];
    for (const useCase of useCases) {
      const result = await this.runUseCaseMultipleTime({
        useCaseInput,
        useCase,
        expectedUseCaseOutput,
        times
      });
      results.push(result);
    }
    return results;
  }
}
