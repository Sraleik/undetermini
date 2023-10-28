import { vi } from "vitest";
import { Undetermini } from "./undetermini";
import { LLM_MODEL_NAME, computeCostOfLlmCall } from "./llm-utils";
import { UsecaseImplementation } from "./usecase-implementation";

let undetermini: Undetermini;

beforeEach(() => {
  undetermini = new Undetermini(false);
});

it("should execute an Implementation with the right input", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn().mockResolvedValue({ result: "coco l'asticot" });

  // Given the UseCase
  const implementation = UsecaseImplementation.create({
    name: "mocked-use-case",
    execute
  });

  await undetermini.run({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
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
      averageCost: expect.any(Number)
    });

    expect(execute).toHaveBeenCalledTimes(times);
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
      usePresenter: true
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
