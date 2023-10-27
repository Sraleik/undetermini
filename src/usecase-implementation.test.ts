import { vi } from "vitest";
import { UsecaseImplementation } from "./usecase-implementation";

it("should return a run result without error", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true",
    execute: async function () {
      return true;
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({ expectedOutput: true });

  // Then it should return the right payload type
  expect(result).toEqual({
    cost: expect.any(Number),
    latency: expect.any(Number),
    accuracy: expect.any(Number),
    error: undefined
  });
});

it("should return a run result with an error", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return an Error",
    execute: async function () {
      throw new Error("A catastrophic error occured");
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({ expectedOutput: true });

  // Then it should return the right payload type
  expect(result).toEqual({
    cost: expect.any(Number),
    latency: expect.any(Number),
    accuracy: 0,
    error: expect.any(Error)
  });
});

it("should return a 100% accuracy on a boolean return", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true",
    execute: async function () {
      return true;
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({ expectedOutput: true });

  // Then it should return the right accuracy
  expect(result.accuracy).toEqual(100);
});

it("should return a 100% accuracy on an expected object return", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return 'coco lastico'",
    execute: async function () {
      return { value: "coco l'asticot" };
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({
    expectedOutput: {
      value: "coco l'asticot"
    }
  });

  // Then it should return the right accuracy
  expect(result.accuracy).toEqual(100);
});

it("should return a 50% accuracy on an object with half the value right", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return Coco profile",
    execute: async function () {
      return {
        firstname: "Coco",
        lastname: "l'asticot",
        age: 32,
        job: "Developer Web"
      };
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({
    expectedOutput: {
      firstname: "Coco",
      lastname: "l'asticot",
      age: 33,
      job: "Software Engineer"
    }
  });

  // Then it should return the right accuracy
  expect(result.accuracy).toEqual(50);
});

it("should return proper cost", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true and handle cost",
    execute: async function () {
      this.addCost(0.12); // Simulate a function that have a fixed cost of 12 cents
      return true;
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({ expectedOutput: true });

  // Then it should return the right cost
  expect(result.cost).toEqual(0.12);
});

it("should have proper latency", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true and take ~50ms",
    execute: async function () {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run({ expectedOutput: true });

  // Then it should return a latency close to 50ms
  expect(result.latency).toBeCloseTo(50, -1);
});

it("should call the execute function with the useCaseInput", async () => {
  // Given a UsecaseImplementation
  const execute = vi.fn(async function (input) {
    return input;
  });

  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return the input",
    execute
  });

  // Given an Input
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // When the implementation is run
  await usecaseImplementation.run({
    input: useCaseInput,
    expectedOutput: true
  });

  // Then it should return a latency close to 50ms
  expect(execute).toBeCalledWith(useCaseInput);
});

it("should return right cost, latency, accuracy", async () => {
  // Given a UsecaseImplementation
  const execute = vi.fn(async function (input) {
    this.addCost(0.25); // 25 cents the function
    await new Promise((resolve) => setTimeout(resolve, 33));
    return { value: input.value.toLowerCase() };
  });

  const usecaseImplementation = UsecaseImplementation.create({
    name: "return lower case of value",
    execute
  });

  // Given an Input
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // When the implementation is run
  const result = await usecaseImplementation.run({
    input: useCaseInput,
    expectedOutput: { value: "coco l'asticot" }
  });

  // Then it should return a latency close to 50ms
  expect(execute).toBeCalledWith(useCaseInput);
  expect(result.latency).toBeCloseTo(33, -1);
  expect(result).toContain({
    cost: 0.25,
    accuracy: 100,
    error: undefined
  });
});
