import { vi } from "vitest";
import { Undetermini, Implementation } from "./undetermini";
import { LLM_MODEL_NAME } from "./llm-utils";

function around(value: number, expected: number, delta: number = 0.01) {
  return Math.abs(value - expected) < delta;
}

const undetermini = new Undetermini();
it("should execute an Implementation with the right input", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn().mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const implementation: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
});

it("should have the proper Implementation Name", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const implementation: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  const undeterminiResult = results[0];
  expect(undeterminiResult.name).toEqual("mocked-use-case");
});

it.skip("should have the proper averageCost", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };

  // Given A simple UseCase
  const execute = vi.fn().mockImplementation((payload, handleCost) => {
    const result = { value: "coco l'asticot" };
    handleCost(JSON.stringify(payload), JSON.stringify(result));

    return new Promise((resolve) => {
      resolve(result);
    });
  });

  // Given the Implementation
  const implementation: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_4_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  // When we run this implementation
  const underminiResult = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  const implementationResult = underminiResult[0];

  expect(implementationResult.averageCost).toBe(0.066);
});

it("should have the proper averageLatency", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn().mockImplementation(() => {
    const result = { value: "coco l'asticot" };

    return new Promise((resolve) => {
      setTimeout(() => resolve(result), 300);
    });
  });

  // Given the UseCase
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  // When we run undetermini
  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 5
  });

  // Then
  const implementationResult = results[0];
  const isAroundOneSecond = around(
    300,
    implementationResult.averageLatency,
    100
  );

  expect(isAroundOneSecond).toBe(true);
});

it("should not rerun the implementation when enough occurences are cached", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    value: "coco l'asticot",
    keyShouldBe: "missing"
  };
  const execute = vi
    .fn()
    .mockResolvedValue({ value: "coco l'amqlkqsdfqsdfsdjfsticot" });

  // Given an Implementation
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  // Given the same function is asked to be run once
  await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 1
  });
  execute.mockClear();

  //When ask for one run with cache
  await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase],
    times: 1,
    useCache: true
  });

  // Then it should not call the implementation
  expect(execute).not.toHaveBeenCalled();
});

it("should have an averageAccuracy of 50%", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    value: "coco l'asticot",
    keyShouldBe: "missing"
  };
  const execute = vi.fn().mockResolvedValue({ value: "coco l'asticot" });

  // Given an Implementation
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase]
  });

  const implementation = results[0];
  expect(implementation.averageAccuracy).toEqual(50);
});

it("should have an averageAccuracy of 100%", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const implementation: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [implementation]
  });

  const implementationResult = results[0];
  expect(implementationResult.averageAccuracy).toEqual(100);
});

it.each([{ times: 1 }, { times: 10 }, { times: 100 }, { times: 1000 }])(
  "should execute a single use case $times times",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };
    type UseCaseInput = typeof useCaseInput;

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };
    const execute = vi.fn().mockResolvedValue({ value: "coco l'asticot" });

    // Given  an Implementation
    const implementation: Implementation<UseCaseInput> = {
      modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
      name: "mocked-use-case",
      execute
    };

    const results = await undetermini.run<UseCaseInput>({
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

it.each([{ times: 1 }, { times: 10 }, { times: 100 }, { times: 1000 }])(
  "should execute 3 implementation $times times",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };
    type UseCaseInput = typeof useCaseInput;

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };

    // Given 3 Implementation
    const implementation1: Implementation<UseCaseInput> = {
      modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
      name: "mocked-implementation-1",
      execute: vi.fn().mockResolvedValue({ value: "coco l'asticot" })
    };
    const implementation2: Implementation<UseCaseInput> = {
      modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
      name: "mocked-implementation-2",
      execute: vi.fn().mockResolvedValue({ value: "coco l'asticot" })
    };
    const implementation3: Implementation<UseCaseInput> = {
      modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
      name: "mocked-implementation-3",
      execute: vi.fn().mockResolvedValue({ value: "coco l'asticot" })
    };

    await undetermini.run<UseCaseInput>({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [implementation1, implementation2, implementation3],
      times
    });

    expect(implementation1.execute).toHaveBeenCalledTimes(times);
    expect(implementation2.execute).toHaveBeenCalledTimes(times);
    expect(implementation3.execute).toHaveBeenCalledTimes(times);
  }
);
