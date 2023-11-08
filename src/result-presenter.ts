import { Table } from "console-table-printer";
import chalk from "chalk";
import currency from "currency.js";
import { MultipleRunResult } from "./undetermini";

export class ResultPresenter {
  private table: Table;
  static readonly defaultSortPriority = [
    "accuracy",
    "latency",
    "cost",
    "error"
  ];

  private columnSorting = {
    cost: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return currency(row1.averageCost, { precision: 10 }).subtract(
        row2.averageCost
      ).value;
    },
    latency: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return row1.averageLatency - row2.averageLatency;
    },
    accuracy: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return row2.averageLatency - row1.averageLatency;
    },
    error: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return row1.averageError - row2.averageError;
    }
  };

  //TODO improve threshold structure
  private defaultThreshold = {
    getAccuracyColor: (value: number) => {
      if (value < 50) return "red";
      if (value < 80) return "yellowBright";
      if (value < 100) return "green";
      return "greenBright";
    },
    cost: {},
    latency: {}
    //TODO: do error default threshold
  };

  constructor(options?: { sortPriority?: string[] }) {
    const defaultSortPriority = [...ResultPresenter.defaultSortPriority];

    let sortPriority: string[] = [];
    if (options?.sortPriority?.length) {
      options.sortPriority.forEach((columnName) => {
        sortPriority.push(columnName);
        const index = defaultSortPriority.indexOf(columnName);
        if (index > -1) {
          defaultSortPriority.splice(index, 1);
        }
      });
    }
    sortPriority = [...sortPriority, ...defaultSortPriority];

    this.table = new Table({
      columns: [
        { name: "name", title: "Implementation Name", alignment: "left" },
        { name: "averageAccuracy" },
        { name: "averageLatency" },
        { name: "averageCost" },
        { name: "averageError" }
      ],
      disabledColumns: [
        "averageAccuracy",
        "averageLatency",
        "averageCost",
        "averageError"
      ],
      sort: (row1, row2) => {
        const sort1Res = this.columnSorting[sortPriority[0]](row1, row2);
        if (sort1Res !== 0) return sort1Res;

        const sort2Res = this.columnSorting[sortPriority[1]](row1, row2);
        if (sort2Res !== 0) return sort2Res;

        const sort3Res = this.columnSorting[sortPriority[2]](row1, row2);
        if (sort3Res !== 0) return sort3Res;

        return this.columnSorting[sortPriority[2]](row1, row2);
      }
    });

    const possibleColumns = {
      cost: { name: "coloredCost", title: "Average cost ($)" },
      latency: { name: "coloredLatency", title: "Average Latency (ms)" },
      accuracy: { name: "coloredAccuracy", title: "Average Accuracy (%)" },
      error: { name: "coloredError", title: "Error (%)" }
    };

    sortPriority.forEach((columnName) => {
      this.table.addColumn(possibleColumns[columnName]);
    });

    //@ts-expect-error it works fine
    this.table.addColumn({ name: "realCallCount", title: "Real usecase call" });
    //@ts-expect-error it works fine
    this.table.addColumn({
      name: "callFromCacheCount",
      title: "Cached usecase call"
    });
    //@ts-expect-error it works fine
    this.table.addColumn({ name: "resultsFullPrice", title: "Full Cost" });
    //@ts-expect-error it works fine
    this.table.addColumn({
      name: "resultsCurrentPrice",
      title: "Cost with cache"
    });
  }

  addResults(data: MultipleRunResult[]) {
    data.forEach((rawRow) => {
      const accuracyColor = this.getAccuracyColor(rawRow.averageAccuracy);
      const coloredAccuracy = chalk[accuracyColor](rawRow.averageAccuracy);
      const coloredCost = rawRow.averageCost;
      const coloredLatency = rawRow.averageLatency;
      const coloredError = rawRow.averageError;

      const row = {
        ...rawRow,
        coloredAccuracy,
        coloredCost,
        coloredLatency,
        coloredError
      };

      this.table.addRow(row);
    });

    return this.table;
  }

  displayResults(times: number) {
    this.table.table.title = `Results on ${times} calls for each Implementation`;
    this.table.printTable();
  }

  get getAccuracyColor() {
    return this.defaultThreshold.getAccuracyColor;
  }
}
