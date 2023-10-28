import { RunResultRepository } from "./run-result.repository";

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
