import { LLM_MODEL_NAME, Undetermini, Implementation } from "./undetermini";
import { vi } from "vitest";

function around(value: number, expected: number, delta: number = 0.01) {
  return Math.abs(value - expected) < delta;
}

const undetermini = new Undetermini();
it("should execute a UseCase with the right input", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase]
  });

  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
});

it("should have the proper UseCase Name", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
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

  const useCaseResult = results[0];
  expect(useCaseResult.name).toEqual("mocked-use-case");
});

it("should have the proper averageCost", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };

  // Given A simple UseCase
  const execute = vi.fn();
  execute.mockImplementation((payload, handleCost) => {
    const result = { value: "coco l'asticot" };
    handleCost(JSON.stringify(payload), JSON.stringify(result));

    return new Promise((resolve) => {
      resolve(result);
    });
  });

  // Given the UseCase
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_4_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  // When we run the UseCase

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase]
  });

  const useCaseResult = results[0];

  expect(useCaseResult.averageCost).toBe(0.066);
});

it("should have the proper averageLatency", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockImplementation(() => {
    const result = { value: "coco l'asticot" };

    return new Promise((resolve) => {
      setTimeout(() => resolve(result), 1000);
    });
  });

  // Given the UseCase
  const useCase: Implementation<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  // When we run the UseCase

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations: [useCase]
  });

  const useCaseResult = results[0];
  const ONE_SECOND = 1_000;
  const isAroundOneSecond = around(
    ONE_SECOND,
    useCaseResult.averageLatency,
    300
  );

  expect(isAroundOneSecond).toBe(true);
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

  const useCaseResult = results[0];
  expect(useCaseResult.averageAccuracy).toEqual(100);
});

it.each([{ times: 1 }, { times: 10 }, { times: 100 }, { times: 1000 }])(
  "should execute a single use case $times times",
  async ({ times }) => {
    // Given a value given to our use case
    const useCaseInput = { value: "COCO L'ASTICOT" };
    type UseCaseInput = typeof useCaseInput;

    // Given an expected output (here we expect the string to be lowercase)
    const expectedUseCaseOutput = { value: "coco l'asticot" };
    const execute = vi.fn();
    execute.mockResolvedValue({ value: "coco l'asticot" });

    // Given the UseCase
    const useCase: Implementation<UseCaseInput> = {
      modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
      name: "mocked-use-case",
      execute
    };

    const results = await undetermini.run<UseCaseInput>({
      useCaseInput,
      expectedUseCaseOutput,
      implementations: [useCase],
      times
    });

    const useCaseResult = results[0];
    expect(useCaseResult).toEqual({
      averageAccuracy: 100,
      name: "mocked-use-case",
      averageLatency: expect.any(Number),
      averageCost: expect.any(Number)
    });

    expect(execute).toHaveBeenCalledTimes(times);
  }
);
