import { ResultPresenter } from "./result-presenter";
it("should display a sexy table with the default column order & sort (Accuracy > Latency > Cost)", () => {
  const resultPresenter = new ResultPresenter();

  const table = resultPresenter.addResults([
    {
      name: "Get Candidate, Accurate",
      averageCost: 0.001,
      averageLatency: 500,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, Accurate & Fast",
      averageCost: 0.001,
      averageLatency: 250,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, GPT-4",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 50
    },
    {
      name: "Get Candidate, Accurate & Fast & Cheap",
      averageCost: 0.00001,
      averageLatency: 250,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, Coherere",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 33
    },
    {
      name: "Get Candidate, GPT3.5 fine tune (dataset 332)",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 95
    }
  ]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );
  expect(accuracyIndex < latencyIndex).toBe(true);
  expect(latencyIndex < costIndex).toBe(true);
});

it("should display a sexy table with the default column order & sort (Accuracy > Cost > Latency)", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["accuracy", "cost", "latency"]
  });

  const table = resultPresenter.addResults([]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );

  expect(accuracyIndex < costIndex).toBe(true);
  expect(costIndex < latencyIndex).toBe(true);
});

it("should display a sexy table with the following column order & sort (Cost > Latency > Accuracy)", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["cost", "latency", "accuracy"]
  });
  const table = resultPresenter.addResults([]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );
  expect(costIndex < latencyIndex).toBe(true);
  expect(latencyIndex < accuracyIndex).toBe(true);
});

it("should display a sexy table with the following column order & sort (Cost > Accuracy > Latency)", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["cost", "accuracy", "latency"]
  });
  const table = resultPresenter.addResults([]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );

  expect(costIndex < accuracyIndex).toBe(true);
  expect(accuracyIndex < latencyIndex).toBe(true);
});

it("should display a sexy table with the following column order & sort (Latency > Cost > Accuracy)", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["latency", "cost", "accuracy"]
  });
  const table = resultPresenter.addResults([]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );

  expect(latencyIndex < costIndex).toBe(true);
  expect(costIndex < accuracyIndex).toBe(true);
});

it("should display a sexy table with the following column order & sort (Latency > Accuracy > Cost)", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["latency", "accuracy", "cost"]
  });
  const table = resultPresenter.addResults([]);

  const accuracyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredAccuracy"
  );
  const latencyIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredLatency"
  );
  const costIndex = table.table.columns.findIndex(
    (column) => column.name === "coloredCost"
  );

  expect(latencyIndex < accuracyIndex).toBe(true);
  expect(accuracyIndex < costIndex).toBe(true);
});
