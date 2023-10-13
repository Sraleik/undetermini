import { ValueOf } from "./common/utils";

export type UseCaseFunction<T> = (
  payload: T,
  handleCost?: (cost: number) => unknown
) => Promise<Record<string, any>>;

export type UseCase<T> = {
  name: string;
  modelName: LLM_MODEL_NAME;
  execute: UseCaseFunction<T>;
};

export type Output = Record<string, any>;

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

export const LLM_MODEL_NAME = {
  GPT_4_0613: "gpt-4-0613",
  GPT_3_0613: "gpt-3.5-turbo-0613"
} as const;

export type LLM_MODEL_NAME = ValueOf<typeof LLM_MODEL_NAME>;

export const LLM_MODEL_INFO = {
  "gpt-4-0613": {
    price: {
      input1kToken: 3,
      output1kToken: 6
    },
    rateLimit: {
      tpm: 90_000,
      rpm: 3_500
    }
  },
  "gpt-3.5-turbo-0613": {
    price: {
      input1kToken: 0.15,
      output1kToken: 0.2
    },
    rateLimit: {
      tpm: 40_000,
      rpm: 500
    }
  }
} as const;

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

  isTimesAboveRequestPerMinute(times: number, modelName: LLM_MODEL_NAME) {
    return times > LLM_MODEL_INFO[modelName].rateLimit.rpm;
  }

  async runUseCaseMultipleTime<T = any>(payload: {
    useCaseInput: T;
    useCase: UseCase<T>;
    expectedUseCaseOutput: Record<string, any>;
    times: number;
  }) {
    const { useCase, useCaseInput, expectedUseCaseOutput, times } = payload;

    const canParralelizeAll = !this.isTimesAboveRequestPerMinute(
      times,
      useCase.modelName
    );

    let res: MultipleRunResult;

    if (canParralelizeAll) {
      const promises: Promise<SingleRunResult>[] = [];
      console.log(
        "🚀 ~ file: undetermini.ts:124 ~ Undetermini ~ canParralelizeAll:",
        useCase.name
      );

      for (let i = 0; i < (times || 1); i++) {
        promises.push(
          this.singleRun<T>({
            useCaseInput,
            useCase: useCase.execute,
            expectedUseCaseOutput
          })
        );
      }

      const results = await Promise.all(promises);
      console.log(
        "🚀 ~ file: undetermini.ts:139 ~ Undetermini ~ results:",
        results
      );
      const totals = results.reduce(
        (acc, singleRunResult) => {
          acc.accuracy += singleRunResult.accuracy;
          acc.cost += singleRunResult.cost;
          acc.latency += singleRunResult.latency;
          return acc;
        },
        {
          latency: 0,
          accuracy: 0,
          cost: 0
        }
      );
      console.log(
        "🚀 ~ file: undetermini.ts:153 ~ Undetermini ~ totals:",
        totals
      );

      res = {
        name: useCase.name,
        averageLatency: totals.latency / times,
        averageAccuracy: totals.accuracy / times,
        averageCost: totals.cost / times
      };
    } else {
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

      res = {
        name: useCase.name,
        averageLatency: totalLatency / times,
        averageAccuracy: totalAccuracy / times,
        averageCost: totalCost / times
      };
    }

    return res;
  }

  // Run UseCases
  async run<T = any>(payload: {
    useCaseInput: T;
    useCases: UseCase<T>[];
    expectedUseCaseOutput: Record<string, any>;
    times?: number;
  }) {
    const {
      useCases,
      useCaseInput,
      expectedUseCaseOutput,
      times = 1
    } = payload;

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
