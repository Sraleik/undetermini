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
    runId: expect.any(String),
    implementationId: expect.any(String),
    inputId: expect.any(String),
    input: undefined,
    result: true,
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
    runId: expect.any(String),
    implementationId: expect.any(String),
    inputId: expect.any(String),
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

it("should return the hash of the run", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true and take ~50ms",
    execute: async function () {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    }
  });
  // Given an Input
  const useCaseInput = { value: "COCO L'ASTICOT" };

  // When the implementation is run
  const result = await usecaseImplementation.getRunHash(useCaseInput);

  // Then it should return a latency close to 50ms
  expect(result).toEqual(
    "afea24909122d0d14204596d95108d942171a986efaafffa45a0b4c75b4b5fa7"
  );
});

it("should return same hash when input is the same be not in the same order", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true and take ~50ms",
    execute: async function () {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    }
  });
  // Given an Input
  const useCaseInput1 = {
    firstname: "Coco",
    lastname: "l'asticot",
    age: 32,
    job: "Developer Web"
  };
  const useCaseInput2 = {
    lastname: "l'asticot",
    job: "Developer Web",
    age: 32,
    firstname: "Coco"
  };

  // When the implementation is run
  const runHash1 = await usecaseImplementation.getRunHash(useCaseInput1);
  const runHash2 = await usecaseImplementation.getRunHash(useCaseInput2);

  // Then it should return the same hash
  expect(runHash1).toEqual(
    "ea8bd6c1a217ecdac6dd5c1f1648e334beb3d68452a1b6768e478b9125408b7b"
  );
  expect(runHash2).toEqual(
    "ea8bd6c1a217ecdac6dd5c1f1648e334beb3d68452a1b6768e478b9125408b7b"
  );
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

it("should return right cost, latency, accuracy, runId, implementationId, inputId", async () => {
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
    runId: "c560b40b14c75bf29b00c04b4f6df6496965b90d28d0d5dd4cdd71e82fe9c1dd",
    implementationId:
      "25be3adaad14736fcc65592e69fe7253d8b1286a3b975f983a809fb5ca1856b4",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    cost: 0.25,
    accuracy: 100,
    error: undefined
  });
});
