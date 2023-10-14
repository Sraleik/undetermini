import { ValueOf } from "./common/utils";
import { encodingForModel } from "js-tiktoken";
import cohere from "cohere-ai";

export type UseCaseFunction<T> = (
  payload: T,
  handleCost?: (prompt: string, rawResult: string) => Promise<unknown>
) => Promise<Record<string, any>>;

export type UseCase<T> = {
  name: string;
  modelName: LLM_MODEL_NAME; // should be of type string
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

export const OPENAI_MODEL_NAME = {
  GPT_4_0613: "gpt-4-0613",
  GPT_3_0613: "gpt-3.5-turbo-0613"
} as const;

export const LLM_MODEL_NAME = {
  ...OPENAI_MODEL_NAME,
  COHERE_GENERATE: "cohere-generate"
} as const;

export type LLM_MODEL_NAME = ValueOf<typeof LLM_MODEL_NAME>;
export type OPENAI_MODEL_NAME = ValueOf<typeof OPENAI_MODEL_NAME>;
export type LLM_INFO = {
  price: {
    input1kToken: number;
    output1kToken: number;
  };
  rateLimit: {
    tpm: number;
    rpm: number;
  };
};

export const LLM_MODEL_INFO: Record<LLM_MODEL_NAME, LLM_INFO> = {
  "cohere-generate": {
    price: {
      input1kToken: 1.5,
      output1kToken: 1.5
    },
    rateLimit: {
      tpm: 100_000, // fake value I don't have them
      rpm: 50_000 // fake value I don't have them
    }
  },
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
    useCase: UseCase<T>;
    useCaseInput: T;
    expectedUseCaseOutput: Output;
  }) {
    const { useCase, useCaseInput, expectedUseCaseOutput } = payload;

    let costOfThisRun = 0;
    const startTime = Date.now();
    const output = await useCase.execute(
      useCaseInput,
      async (prompt: string, rawResult: string) => {
        let inputTokenCount = 0;
        let outputTokenCount = 0;
        if (useCase.modelName === LLM_MODEL_NAME.COHERE_GENERATE) {
          inputTokenCount = (await cohere.tokenize({ text: prompt })).body
            .tokens.length;
          outputTokenCount = (await cohere.tokenize({ text: rawResult })).body
            .tokens.length;
        } else {
          const enc = encodingForModel(useCase.modelName);
          inputTokenCount = enc.encode(prompt).length;
          outputTokenCount = enc.encode(rawResult).length;
        }
        const inputPrice =
          (inputTokenCount *
            LLM_MODEL_INFO[useCase.modelName].price.input1kToken) /
          1000;
        const outputPrice =
          (outputTokenCount *
            LLM_MODEL_INFO[useCase.modelName].price.input1kToken) /
          1000;

        costOfThisRun = inputPrice + outputPrice;
      }
    );
    const endTime = Date.now();

    const latency = endTime - startTime;
    const accuracy = this.computeAccuracyDefault(expectedUseCaseOutput, output);
    return { latency, accuracy, cost: costOfThisRun };
  }

  private isTimesAboveRequestPerMinute(
    times: number,
    modelName: LLM_MODEL_NAME
  ) {
    return times > LLM_MODEL_INFO[modelName].rateLimit.rpm;
  }

  private async runUseCaseMultipleTime<T = any>(payload: {
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

      for (let i = 0; i < (times || 1); i++) {
        promises.push(
          this.singleRun<T>({
            useCaseInput,
            useCase,
            expectedUseCaseOutput
          })
        );
      }

      const results = await Promise.all(promises);
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
          useCase: useCase,
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

    const useCasesPerModel = useCases.reduce(
      (acc, useCase) => {
        const currentModelUseCases = acc[useCase.modelName];
        acc[useCase.modelName] = currentModelUseCases
          ? [...currentModelUseCases, useCase]
          : [useCase];
        return acc;
      },
      {} as Record<LLM_MODEL_NAME, UseCase<T>[]>
    );

    const useCasesPerModelToRunInParallel = Object.values(useCasesPerModel);
    const promisePerModel = useCasesPerModelToRunInParallel.map(
      async (useCasesToRunInSync) => {
        for (const useCase of useCasesToRunInSync) {
          const result = await this.runUseCaseMultipleTime({
            useCaseInput,
            useCase,
            expectedUseCaseOutput,
            times
          });
          results.push(result);
        }
      }
    );

    await Promise.all(promisePerModel);

    return results;
  }
}
