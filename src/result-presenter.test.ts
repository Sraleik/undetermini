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
      const priorityOrderName = columnOrder.map(
        (column) => column.name
      ) as string[];

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
