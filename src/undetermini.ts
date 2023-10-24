import currency from "currency.js";
import {
  LLM_MODEL_NAME,
  computeCostOfLlmCall,
  llmModelInfo
} from "./llm-utils";
import { defaultCache } from "./cache";
import crypto from "node:crypto";

export type ImplementationFunction<T> = (
  payload: T,
  handleCost?: (prompt: string, rawResult: string) => Promise<unknown>
) => Promise<Record<string, any>>;

export type Implementation<T> = {
  name: string;
  modelName: LLM_MODEL_NAME; // should be of type string
  execute: ImplementationFunction<T>;
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

async function hashFunction(fn: (...args: any[]) => any) {
  const encoder = new TextEncoder();
  const data = encoder.encode(fn.toString());
  const hash = crypto.createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

export class Undetermini {
  constructor(private cacheClient = defaultCache) {}

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

  private async singleImplementationOnce<T>(payload: {
    implementation: Implementation<T>;
    useCaseInput: T;
    expectedUseCaseOutput: Output;
    useCache: boolean;
  }) {
    const { implementation, useCaseInput, expectedUseCaseOutput, useCache } =
      payload;

    if (useCache) {
      const oldRuns = this.cacheClient.getImplementationRunResults({
        implementationId: await hashFunction(implementation.execute),
        inputId: "osef"
      });
      const oldRun = oldRuns[0];
      return {
        cost: oldRun.cost,
        accuracy: oldRun.accuracy,
        latency: oldRun.latency
      };
    }

    let costOfThisRun: currency = currency(0);
    const startTime = Date.now();
    //TODO: remove the cost calculation from here
    const output = await implementation.execute(
      useCaseInput,
      async (prompt: string, rawResult: string) => {
        costOfThisRun = await computeCostOfLlmCall(
          implementation.modelName,
          prompt,
          rawResult
        );
      }
    );
    const endTime = Date.now();

    const latency = endTime - startTime;
    const accuracy = this.computeAccuracyDefault(expectedUseCaseOutput, output);
    const cost = costOfThisRun.value;

    const implementationId = await hashFunction(implementation.execute);

    this.cacheClient.addImplementationRunResult({
      implementationId,
      latency,
      accuracy,
      cost
    });
    return { latency, accuracy, cost };
  }

  private isTimesAboveRequestPerMinute(
    times: number,
    modelName: LLM_MODEL_NAME
  ) {
    //@ts-expect-error is ok
    return times > llmModelInfo[modelName].rateLimit.rpm;
  }

  private async runImplementationMultipleTime<T = any>(payload: {
    useCaseInput: T;
    implementation: Implementation<T>;
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

    const canParralelizeAll = !this.isTimesAboveRequestPerMinute(
      times,
      implementation.modelName
    );

    let res: MultipleRunResult;
    const implementationId = await hashFunction(implementation.execute);
    const runExisting = useCache
      ? this.cacheClient.getImplementationRunResults({
          implementationId,
          inputId: "osef"
        }).length
      : 0;

    const callNeeded = useCache ? times - runExisting : times;

    if (canParralelizeAll) {
      const promises: Promise<SingleRunResult>[] = [];

      for (let i = 0; i < times; i++) {
        promises.push(
          this.singleImplementationOnce<T>({
            useCaseInput,
            implementation,
            expectedUseCaseOutput,
            useCache: i >= callNeeded
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
        name: implementation.name,
        averageLatency: totals.latency / times,
        averageAccuracy: totals.accuracy / times,
        averageCost: totals.cost / times
      };
    } else {
      let totalLatency = 0;
      let totalAccuracy = 0;
      let totalCost = 0;

      for (let i = 0; i < (times || 1); i++) {
        const res = await this.singleImplementationOnce<T>({
          useCaseInput,
          implementation: implementation,
          expectedUseCaseOutput,
          useCache: i > callNeeded
        });
        totalLatency += res.latency;
        totalAccuracy += res.accuracy;
        totalCost += res.cost;
      }

      res = {
        name: implementation.name,
        averageLatency: totalLatency / times,
        averageAccuracy: totalAccuracy / times,
        averageCost: totalCost / times
      };
    }

    return res;
  }

  // Run UseCases
  async run<T = any>(payload: {
    times?: number;
    useCache?: boolean;
    useCaseInput: T;
    implementations: Implementation<T>[];
    expectedUseCaseOutput: Record<string, any>;
  }) {
    const {
      implementations,
      useCaseInput,
      expectedUseCaseOutput,
      times = 1,
      useCache = false
    } = payload;

    const results: MultipleRunResult[] = [];

    const implementationPerModel = implementations.reduce(
      (acc, implementation) => {
        const currentModelUseCases = acc[implementation.modelName];
        acc[implementation.modelName] = currentModelUseCases
          ? [...currentModelUseCases, implementation]
          : [implementation];
        return acc;
      },
      {} as Record<LLM_MODEL_NAME, Implementation<T>[]>
    );

    const implementationToRunInParallel = Object.values(implementationPerModel);
    const promisePerModel = implementationToRunInParallel.map(
      async (implementationsToRunInSync) => {
        for (const implementation of implementationsToRunInSync) {
          const result = await this.runImplementationMultipleTime({
            useCaseInput,
            implementation: implementation,
            expectedUseCaseOutput,
            times,
            useCache
          });
          results.push(result);
        }
      }
    );

    await Promise.all(promisePerModel);

    return results;
  }
}
