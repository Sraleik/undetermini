import { vi } from "vitest";
import { Undetermini } from "./undetermini";
import { LLM_MODEL_NAME, computeCostOfLlmCall } from "./llm-utils";
import { UsecaseImplementation } from "./usecase-implementation";
import { RunResultRepository } from "./run-result.repository";
import fs from "node:fs";

let undetermini: Undetermini;

beforeEach(async () => {
  if (fs.existsSync(`${__dirname}/../undetermini-db.json`)) {
    fs.unlinkSync(`${__dirname}/../undetermini-db.json`);
  }
  undetermini = await Undetermini.create();
});

it("should throw if no expectedOutput and no evaluateAccuracy is given", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const execute = vi.fn().mockResolvedValue({ result: "coco l'asticot" });

  // Given the UseCase
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  await expect(() =>
    undetermini.run({
      useCaseInput,
      implementations: [implementation]
    })
  ).rejects.toThrow(
    "Undetermini need either expectedOutput or an evaluateAccuracy Function"
  );
});

it("should tag the result with retrieveFromCache properly and return price per ImplementationResults", async () => {
  const runResultRepository = await RunResultRepository.create({
    persistOnDisk: true
  });

  await runResultRepository.addRunResult({
    runId: "c560b40b14c75bf29b00c04b4f6df6496965b90d28d0d5dd4cdd71e82fe9c1dd",
    implementationId:
      "25be3adaad14736fcc65592e69fe7253d8b1286a3b975f983a809fb5ca1856b4",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    input: { value: "COCO L'ASTICOT" },
    result: { result: "coco l'asticot" },
    latency: 0,
    cost: 3,
    runnedAt: new Date("2023-11-07T11:00:00.703Z")
  });

  await runResultRepository.addRunResult({
    runId: "c560b40b14c75bf29b00c04b4f6df6496965b90d28d0d5dd4cdd71e82fe9c1dd",
    implementationId:
      "25be3adaad14736fcc65592e69fe7253d8b1286a3b975f983a809fb5ca1856b4",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    input: { value: "COCO L'ASTICOT" },
    result: { result: "coco l'asticot" },
    latency: 0,
    cost: 1,
    runnedAt: new Date("2023-11-07T11:01:00.703Z")
  });

  await runResultRepository.addRunResult({
    runId: "c560b40b14c75bf29b00c04b4f6df6496965b90d28d0d5dd4cdd71e82fe9c1dd",
    implementationId:
      "25be3adaad14736fcc65592e69fe7253d8b1286a3b975f983a809fb5ca1856b4",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    input: { value: "COCO L'ASTICOT" },
    result: { result: "coco l'asticot" },
    latency: 0,
    cost: 2,
    runnedAt: new Date("2023-11-07T11:02:00.703Z")
  });

  undetermini = new Undetermini(runResultRepository);
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn().mockImplementation(function () {
    this.addCost(2);
    Promise.resolve({ value: "coco l'asticot" });
  });

  // Given the UseCase
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  const res = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    times: 6,
    useCache: true,
    implementations: [implementation]
  });

  expect(res[0].realCallCount).toBe(3);
  expect(res[0].callFromCacheCount).toBe(3);
  expect(res[0].resultsFullPrice).toBe(12);
  expect(res[0].resultsCurrentPrice).toBe(6);
});

it("should have the proper Implementation Name", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  const results = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  const undeterminiResult = results[0];
  expect(undeterminiResult.name).toEqual("mocked-use-case");
});

it("should have the proper averageCost", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };

  // Given A simple UseCase
  const execute = async function (payload: Record<string, string>) {
    const result = { value: "coco l'asticot" };

    const res = computeCostOfLlmCall(
      LLM_MODEL_NAME.GPT_4_0613,
      JSON.stringify(payload),
      JSON.stringify(result)
    );

    this.addCost(res.value);

    return new Promise((resolve) => {
      resolve(result);
    });
  };

  // Given the Implementation
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  // When we run this implementation
  const underminiResult = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation],
    times: 5
  });

  const implementationResult = underminiResult[0];

  expect(implementationResult.averageCost).toBe(0.096);
});

it("should have the proper averageLatency", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn().mockImplementation(() => {
    const result = { value: "coco l'asticot" };

    return new Promise((resolve) => {
      setTimeout(() => resolve(result), 50);
    });
  });

  // Given the UseCase
  const useCase = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  // When we run undetermini
  const results = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase, useCase, useCase, useCase], // I put the useCase multiple times here to test parallelization
    times: 100 // I put a "high" number to test parallelization
  });

  // Then
  const implementationResult = results[0];

  expect(implementationResult.averageLatency).toBeCloseTo(50, -1);
  expect(execute).toBeCalledTimes(400); // Making sure execute is call the righ amout of time
  // Info: this test is running 400 call that all take 50ms. It does so in parallel
  // On my computer the test is run in 100ms, with no parallelization it would be 20seconds
});

it("should have an averageAccuracy of 50%", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    value: "coco l'asticot",
    keyShouldBe: "missing"
  };
  const execute = vi.fn().mockResolvedValue({ value: "coco l'asticot" });

  // Given an Implementation
  const useCase = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  const results = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 10
  });

  const implementation = results[0];
  expect(implementation.averageAccuracy).toEqual(50);
});

it("should have an averageAccuracy of 100%", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  const results = await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation],
    times: 10
  });

  const implementationResult = results[0];
  expect(implementationResult.averageAccuracy).toEqual(100);
});

it("should not rerun the implementation when enough occurences are cached", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    value: "coco l'asticot",
    keyShouldBe: "missing"
  };
  const execute = vi
    .fn()
    .mockResolvedValue({ value: "coco l'amqlkqsdfqsdfsdjfsticot" });

  // Given an Implementation
  const useCase = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  // Given the same function is asked to be run once
  await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 1
  });
  execute.mockClear();

  //When ask for one run with cache
  await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 1,
    useCache: true
  });

  // Then it should not call the implementation
  expect(execute).not.toHaveBeenCalled();
});

it("should run the implementation only the needed number of times", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    value: "coco l'asticot",
    keyShouldBe: "missing"
  };
  const execute = vi
    .fn()
    .mockResolvedValue({ value: "coco l'amqlkqsdfqsdfsdjfsticot" });

  // Given an Implementation
  const useCase = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  // Given the same function is asked to be run once
  await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 4
  });
  execute.mockClear();

  //When ask for one run with cache
  await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 10,
    useCache: true
  });

  // Then it should not call the implementation
  expect(execute).toHaveBeenCalledTimes(6);
});

it.each([{ times: 1 }, { times: 10 }, { times: 100 }, { times: 1000 }])(
  "should execute a single use case $times times",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };
    const execute = vi.fn().mockResolvedValue({ value: "coco l'asticot" });

    // Given  an Implementation
    const implementation = UsecaseImplementation.create({
      name: "mocked-use-case",
      execute
    });

    const results = await undetermini.run({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [implementation],
      times
    });

    const implementationResult = results[0];

    expect(implementationResult).toEqual({
      averageAccuracy: 100,
      name: "mocked-use-case",
      averageLatency: expect.any(Number),
      averageCost: expect.any(Number),
      averageError: 0,
      realCallCount: times,
      callFromCacheCount: 0,
      resultsCurrentPrice: 0,
      resultsFullPrice: 0
    });

    expect(execute).toHaveBeenCalledTimes(times);
  }
);

it("should have accuracy of 100 with a custom accuracy function", async () => {
  // Given a value given to our use case
  const useCaseInput = "give me a simple person, with age above 21";

  const execute1 = vi.fn().mockImplementation(() => {
    return Promise.resolve({
      firstname: "Charle Emilie Henry",
      lastname: "De la grande cour blanche",
      age: 33
    });
  });

  // Given 3 Implementation
  const implementation1 = UsecaseImplementation.create({
    name: "mocked-implementation-1",
    execute: execute1
  });

  const res = await undetermini.run({
    useCaseInput,
    evaluateAccuracy: function (output: {
      firstname: string;
      lastname: string;
      age: number;
    }) {
      let accuracy = 0;

      if (!output) return 0;

      if (typeof output.firstname === "string") accuracy += 10;
      if (typeof output.lastname === "string") accuracy += 10;
      if (typeof output.age === "number") accuracy += 10;

      const { firstname, lastname, age } = output;

      if (firstname.includes("Charle")) accuracy += 20;
      if (lastname.includes("De la")) accuracy += 20;
      if (age >= 21) accuracy += 30;

      return accuracy;
    },
    implementations: [implementation1],
    times: 100
  });

  expect(res[0].averageAccuracy).toBe(100);
});

it.each([{ times: 1000 }])(
  "should have accuracy of 100 and averageError of 30",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };

    const execute1 = vi.fn().mockImplementation(() => {
      // Throw an error 30% of the time
      if (Math.random() < 0.3) {
        throw new Error("Mock error");
      }
      return Promise.resolve({ value: "coco l'asticot" });
    });

    // Given 3 Implementation
    const implementation1 = UsecaseImplementation.create({
      name: "mocked-implementation-1",
      execute: execute1
    });

    const res = await undetermini.run({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [implementation1],
      times
    });

    expect(res[0].averageAccuracy).toBe(100);
    expect(res[0].averageError).toBeCloseTo(30, -1);
  }
);

it.each([{ times: 10 }])(
  "should execute 3 implementation $times times and display table",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };

    const execute1 = vi.fn().mockResolvedValue({ value: "coco l'asticot 1" });
    const execute2 = vi.fn().mockResolvedValue({ value: "coco l'asticot 2" });
    const execute3 = vi.fn().mockResolvedValue({ value: "coco l'asticot 3" });

    // Given 3 Implementation
    const implementation1 = UsecaseImplementation.create({
      name: "mocked-implementation-1",
      execute: execute1
    });
    const implementation2 = UsecaseImplementation.create({
      name: "mocked-implementation-2",
      execute: execute2
    });
    const implementation3 = UsecaseImplementation.create({
      name: "mocked-implementation-3",
      execute: execute3
    });

    await undetermini.run({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [implementation1, implementation2, implementation3],
      times,
      presenter: {
        isActive: false,
        options: { sortPriority: ["cost", "accuracy", "latency", "error"] }
      }
    });

    expect(execute1).toHaveBeenCalledTimes(times);
    expect(execute2).toHaveBeenCalledTimes(times);
    expect(execute3).toHaveBeenCalledTimes(times);
  }
);
it.each([{ times: 1 }, { times: 10 }, { times: 100 }, { times: 1000 }])(
  "should execute 3 implementation $times times",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };

    const execute1 = vi.fn().mockResolvedValue({ value: "coco l'asticot 1" });
    const execute2 = vi.fn().mockResolvedValue({ value: "coco l'asticot 2" });
    const execute3 = vi.fn().mockResolvedValue({ value: "coco l'asticot 3" });

    // Given 3 Implementation
    const implementation1 = UsecaseImplementation.create({
      name: "mocked-implementation-1",
      execute: execute1
    });
    const implementation2 = UsecaseImplementation.create({
      name: "mocked-implementation-2",
      execute: execute2
    });
    const implementation3 = UsecaseImplementation.create({
      name: "mocked-implementation-3",
      execute: execute3
    });

    await undetermini.run({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [implementation1, implementation2, implementation3],
      times
    });

    expect(execute1).toHaveBeenCalledTimes(times);
    expect(execute2).toHaveBeenCalledTimes(times);
    expect(execute3).toHaveBeenCalledTimes(times);
  }
);
