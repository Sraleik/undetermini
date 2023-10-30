import { RunResultRepository } from "./run-result.repository";

//TODO do a each for In memory & persistedOnDisk
// so every test are run on each without duplication
describe("Repo In Memory", () => {
  it("should persit one resResult", async () => {
    const runResultRepository = new RunResultRepository(false);
    const resResult = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { fake: "result" },
      cost: 1,
      accuracy: 100,
      latency: 1
    };
    await runResultRepository.addRunResult(resResult);

    const runResults = await runResultRepository.getRunResults({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545"
    });

    expect(runResults.length).toEqual(1);
    expect(runResults[0]).toContain(resResult);
  });

  it("should persit 4 resResults", async () => {
    const runResultRepository = new RunResultRepository(false);
    const resResult = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { fake: "result" },
      cost: 1,
      accuracy: 100,
      latency: 1
    };
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);

    const runResults = await runResultRepository.getRunResults({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545"
    });

    expect(runResults.length).toEqual(4);
  });

  it("should get the right number of runResult for a given runId", async () => {
    const runResultRepository = new RunResultRepository(false);
    const resResult = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { fake: "result" },
      cost: 1,
      accuracy: 100,
      latency: 1
    };
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);

    const runResultsCount = await runResultRepository.getRunResultsCount({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545"
    });

    expect(runResultsCount).toEqual(4);
  });

  it("should return the last 2 result by runnedAt", async () => {
    const runResultRepository = new RunResultRepository(false);
    const resResult1 = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { shouldBeReturned: true },
      cost: 1,
      accuracy: 100,
      latency: 1,
      runnedAt: new Date("2023-10-14T14:54:12Z")
    };
    const resResult2 = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { shouldBeReturned: true },
      cost: 1,
      accuracy: 100,
      latency: 1,
      runnedAt: new Date("2023-10-15T14:54:12Z")
    };
    const resResult3 = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { shouldBeReturned: false },
      cost: 1,
      accuracy: 100,
      latency: 1,
      runnedAt: new Date("2023-10-10T14:54:12Z")
    };
    await runResultRepository.addRunResult(resResult1);
    await runResultRepository.addRunResult(resResult2);
    await runResultRepository.addRunResult(resResult3);

    const runResults = await runResultRepository.getLastRunResults({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      limit: 2
    });

    expect(runResults.length).toEqual(2);
    //@ts-expect-error no pb
    expect(runResults[0].result?.shouldBeReturned).toBe(true);
    //@ts-expect-error no pb
    expect(runResults[1].result?.shouldBeReturned).toBe(true);
  });
});

describe("Repo persisted on disk", () => {
  it.todo('should create "undetermini-db"');

  it("should persit one resResult", async () => {
    const runResultRepository = new RunResultRepository(true);
    const resResult = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { fake: "result" },
      cost: 1,
      accuracy: 100,
      latency: 1
    };
    await runResultRepository.addRunResult(resResult);

    const runResults = await runResultRepository.getRunResults({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545"
    });

    expect(runResults.length).toEqual(1);
    expect(runResults[0]).toContain(resResult);
  });

  it("should persit 4 resResults", async () => {
    const runResultRepository = new RunResultRepository(true);
    const resResult = {
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545",
      implementationId: "c14b0873-673e-4849-9530-861b0d7331c3",
      inputId: "34631d9d-b338-47da-b66c-a066191d08c7",
      input: { fake: "input" },
      result: { fake: "result" },
      cost: 1,
      accuracy: 100,
      latency: 1
    };
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);
    await runResultRepository.addRunResult(resResult);

    const runResults = await runResultRepository.getRunResults({
      runId: "8fe94294-3365-480f-b0a5-16a9ce72b545"
    });

    expect(runResults.length).toEqual(4);
  });
});
