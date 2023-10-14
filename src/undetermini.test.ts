import { LLM_MODEL_NAME, Undetermini, UseCase } from "./undetermini";
import { vi } from "vitest";

const undetermini = new Undetermini();

it("should execute a single use case 1 time", async () => {
  // Given a value given to our use case
  const useCaseInput = { value: "COCO L'ASTICOT" };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = { value: "coco l'asticot" };
  const execute = vi.fn();
  execute.mockResolvedValue({ value: "coco l'asticot" });

  // Given the UseCase
  const useCase: UseCase<UseCaseInput> = {
    modelName: LLM_MODEL_NAME.GPT_3_0613, //TODO: should be someting like "fake-model"
    name: "mocked-use-case",
    execute
  };

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    useCases: [useCase]
  });

  const useCaseResult = results[0];
  expect(useCaseResult).toEqual({
    averageAccuracy: 100,
    name: "mocked-use-case",
    averageLatency: expect.any(Number),
    averageCost: expect.any(Number)
  });

  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][0]).toEqual({ value: "COCO L'ASTICOT" });
});
