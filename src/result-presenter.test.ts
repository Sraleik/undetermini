import {
  generateAllPossibleOrders,
  generatePartialPossibilities
} from "./common/math";
import { ResultPresenter } from "./result-presenter";

const possibleColumns = [
  { name: "accuracy", title: "Accuracy" },
  { name: "latency", title: "Latency" },
  { name: "cost", title: "Cost" },
  { name: "error", title: "Error" }
];

describe("Column order (complete order given)", () => {
  const possibleOrders = generateAllPossibleOrders(possibleColumns);

  possibleOrders.forEach((columnOrder) => {
    const priorityOrder = columnOrder.map((column) => column.title).join(" > ");
    it(`should display a sexy table with the column order & sort => (${priorityOrder})`, () => {
      const priorityOrderName = columnOrder.map((column) => column.name);

      const resultPresenter = new ResultPresenter({
        sortPriority: priorityOrderName
      });

      const table = resultPresenter.addResults([]);

      const columnIndexes = columnOrder.map((columnInfo) => {
        return table.table.columns.findIndex(
          (column) => column.name === `colored${columnInfo.title}`
        );
      });

      // Check if the array is sorted in ascending order
      const isSorted = columnIndexes.every(
        (val, i, arr) => !i || val >= arr[i - 1]
      );
      expect(isSorted).toBe(true);
    });
  });
});

describe("Column order (partial order given)", () => {
  const partialOrders = generatePartialPossibilities(possibleColumns);

  partialOrders.forEach((partialOrder) => {
    const defaultSortPriority = [...ResultPresenter.defaultSortPriority];

    partialOrder.forEach((column) => {
      const index = defaultSortPriority.indexOf(column.name);
      if (index > -1) {
        defaultSortPriority.splice(index, 1);
      }
    });
    const partialOrderName = partialOrder.map((value) => value.name);
    const priorityOrderName = [...partialOrderName, ...defaultSortPriority];
    const priorityOrder = priorityOrderName.join(" > ");

    it(`should display the right order & sort with partial order (${partialOrderName.join(
      ", "
    )}) => (${priorityOrder})`, () => {
      const resultPresenter = new ResultPresenter({
        sortPriority: partialOrderName
      });

      const table = resultPresenter.addResults([]);

      const columnIndexes = priorityOrderName.map((columnName) => {
        return table.table.columns.findIndex(
          (column) =>
            column.name ===
            `colored${columnName.charAt(0).toUpperCase() + columnName.slice(1)}`
        );
      });

      // Check if the array is sorted in ascending order
      const isSorted = columnIndexes.every(
        (val, i, arr) => !i || val >= arr[i - 1]
      );
      expect(isSorted).toBe(true);
    });
  });
});

it.skip("should be pretty", () => {
  const resultPresenter = new ResultPresenter({
    sortPriority: ["error"],
    hideColumns: ["Full Cost", "Cached Call"]
  });
  const table = resultPresenter.addResults([
    {
      name: "Get Candidate, Accurate",
      averageError: 0,
      averageCost: 0.001,
      averageLatency: 500,
      averageAccuracy: 100,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 0.1,
      resultsCurrentPrice: 0.013
    },
    {
      name: "Get Candidate, Accurate & Fast",
      averageError: 0,
      averageCost: 0.001,
      averageLatency: 250,
      averageAccuracy: 100,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 0.1,
      resultsCurrentPrice: 0.013
    },
    {
      name: "Get Candidate, GPT-4",
      averageError: 0,
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 50,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 2,
      resultsCurrentPrice: 0.26
    },
    {
      name: "Get Candidate, Accurate & Fast & Cheap",
      averageCost: 0.00001,
      averageError: 25,
      averageLatency: 250,
      averageAccuracy: 100,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 0.001,
      resultsCurrentPrice: 0.00013
    },
    {
      name: "Get Candidate, Coherere",
      averageError: 0,
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 33,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 2,
      resultsCurrentPrice: 0.013
    },
    {
      name: "Get Candidate, GPT3.5 fine tune (dataset 332)",
      averageError: 0,
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 95,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 2,
      resultsCurrentPrice: 0.26
    },
    {
      name: "Get Candidate, Accurate & Fast & Cheap & few Error",
      averageCost: 0.00001,
      averageError: 5,
      averageLatency: 250,
      averageAccuracy: 100,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 0.001,
      resultsCurrentPrice: 0.00013
    },
    {
      name: "Get Candidate, Accurate & Fast & Cheap & 0 Error",
      averageCost: 0.00001,
      averageError: 0,
      averageLatency: 250,
      averageAccuracy: 100,
      realCallCount: 13,
      callFromCacheCount: 87,
      resultsFullPrice: 0.001,
      resultsCurrentPrice: 0.00013
    }
  ]);
  table.printTable();
});
