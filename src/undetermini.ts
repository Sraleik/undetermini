export type UseCaseFunction<T> = (payload: T) => Promise<Record<string, any>>;
export type Output = Record<string, any>;

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

    const startTime = Date.now();
    const output = await useCase(useCaseInput);
    const endTime = Date.now();

    const latency = endTime - startTime;
    const accuracy = this.computeAccuracyDefault(expectedUseCaseOutput, output);
    return { latency, accuracy };
  }

  async run<T = any>(payload: {
    useCaseInput: T;
    useCase: { name: string; execute: UseCaseFunction<T> };
    expectedUseCaseOutput: Record<string, any>;
    times?: number;
  }) {
    const { useCase, useCaseInput, expectedUseCaseOutput, times } = payload;

    let totalLatency = 0;
    let totalAccuracy = 0;

    for (let i = 0; i < (times || 1); i++) {
      const res = await this.singleRun<T>({
        useCaseInput,
        useCase: useCase.execute,
        expectedUseCaseOutput
      });
      totalLatency += res.latency;
      totalAccuracy += res.accuracy;
    }
    const averageLatency = totalLatency / (times || 1);
    const averageAccuracy = totalAccuracy / (times || 1);

    const cost = Math.random() * (0.15 - 0.01) + 0.01;
    const costString = cost.toFixed(2);
    return [
      {
        name: useCase.name,
        averageLatency,
        averageAccuracy,
        averageCost: costString
      }
    ];
  }
}
