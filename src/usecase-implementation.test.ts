import { vi } from "vitest";
import { UsecaseImplementation } from "./usecase-implementation";
import currency from "currency.js";
import { sleep } from "./common/utils";

it("should return a run result without error", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true",
    execute: async function () {
      return true;
    }
  });

  // When the implementation is run
  const result = await usecaseImplementation.run();

  // Then it should return the right payload type
  expect(result).toEqual({
    runId: expect.any(String),
    implementationId: expect.any(String),
    inputId: expect.any(String),
    input: undefined,
    result: true,
    cost: expect.any(Number),
    latency: expect.any(Number),
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
  const result = await usecaseImplementation.run();

  // Then it should return the right payload type
  expect(result).toEqual({
    runId: expect.any(String),
    implementationId: expect.any(String),
    inputId: expect.any(String),
    cost: expect.any(Number),
    latency: expect.any(Number),
    error: expect.any(Error)
  });
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
  const result = await usecaseImplementation.run();

  // Then it should return the right cost
  expect(result.cost).toEqual(0.12);
});

it("multiple run in parallel should not duplicate cost", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Always return true and handle cost",
    execute: async function (_input: unknown, callId: string) {
      await sleep(2000);

      this.addCost(0.12, callId);
      return true;
    }
  });

  // When the implementation is run in parralel
  const resultPromises = [
    usecaseImplementation.run(),
    usecaseImplementation.run(),
    usecaseImplementation.run(),
    usecaseImplementation.run(),
    usecaseImplementation.run(),
    usecaseImplementation.run(),
    usecaseImplementation.run()
  ];

  const results = await Promise.all(resultPromises);
  const averageCost = results
    .reduce(
      (total, result) => currency(total, { precision: 10 }).add(result.cost),
      currency(0, { precision: 10 })
    )
    .divide(results.length).value;

  // Then it should return the right cost
  expect(averageCost).toEqual(0.12);
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
    input: useCaseInput
  });

  // Then it should return a latency close to 50ms
  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
  expect(result.latency).toBeCloseTo(33, -1);
  expect(result).toContain({
    runId: "244df888e8ced36d14a8ccbbbedc50e12749e3b36070b7146a8ac571edd34b86",
    implementationId:
      "89b50bf7ab7dd035db6e25b1a7f6977f7f9842a41a7b9b17cce4062c4d7859bf",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    cost: 0.25,
    error: undefined
  });
});

it("should return proper cost with usecaseTemplate", async () => {
  // Given a UsecaseImplementation
  const usecaseImplementation = UsecaseImplementation.create({
    name: "Multiply and divise by 10",
    execute: async function ({ x, y }: { x: number; y: number }) {
      const res1 = this.multiply(x, y);
      const res2 = this.divide(res1, 10);
      return res2;
    }
  });

  usecaseImplementation.addMethod({
    name: "multiply",
    implementation: {
      name: "multiply x * y",
      value: function (x: number, y: number) {
        return x * y;
      }
    },
    isActive: true
  });

  usecaseImplementation.addMethod({
    name: "divide",
    implementation: {
      name: "divide x / y",
      value: function (x: number, y: number) {
        this.addCost(0.12);
        return x / y;
      }
    },
    isActive: true
  });

  // When the implementation is run
  const { result, cost } = await usecaseImplementation.run({
    input: { x: 4, y: 50 }
  });

  // Then it should return the right cost
  expect(result).toEqual(20);
  expect(cost).toEqual(0.12);
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
  const result = await usecaseImplementation.run();

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
  const result = usecaseImplementation.getRunHash(useCaseInput);

  // Then it should return a latency close to 50ms
  expect(result).toEqual(
    "b66386abfec21a4958ff41d3d59103f65613e257f8e2551b1d86f0b6a37d70cf"
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
  const runHash1 = usecaseImplementation.getRunHash(useCaseInput1);
  const runHash2 = usecaseImplementation.getRunHash(useCaseInput2);

  // Then it should return the same hash
  expect(runHash1).toEqual(
    "b008146c1eed7dcd1c42d3a0654de06e4db9b34a8faebbaf2b66980171638bef"
  );
  expect(runHash2).toEqual(
    "b008146c1eed7dcd1c42d3a0654de06e4db9b34a8faebbaf2b66980171638bef"
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
    input: useCaseInput
  });

  // Then it should return a latency close to 50ms
  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
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
    input: useCaseInput
  });

  // Then it should return a latency close to 50ms
  expect(execute.mock.calls[0][0]).toEqual(useCaseInput);
  expect(result.latency).toBeCloseTo(33, -1);
  expect(result).toContain({
    runId: "244df888e8ced36d14a8ccbbbedc50e12749e3b36070b7146a8ac571edd34b86",
    implementationId:
      "89b50bf7ab7dd035db6e25b1a7f6977f7f9842a41a7b9b17cce4062c4d7859bf",
    inputId: "77984510fe93ed72d9d25056ede9d86478dacebab5f53daf4288de5a77490642",
    cost: 0.25,
    error: undefined
  });
});
