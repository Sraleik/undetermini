import { Table } from "console-table-printer";
import chalk from "chalk";
import currency from "currency.js";
import { MultipleRunResult } from "./undetermini";

export type HideableColumn =
  | "Error"
  | "Accuracy"
  | "Latency"
  | "Cost"
  | "Real Call"
  | "Cached Call"
  | "Full Cost"
  | "Cached Cost";

export type SortableColumn = "error" | "accuracy" | "latency" | "cost";
export class ResultPresenter {
  private table: Table;
  static readonly defaultSortPriority = [
    "accuracy",
    "latency",
    "cost",
    "error"
  ];

  static getColumnsToHide(columns?: HideableColumn[]) {
    if (!columns) return undefined;
    const mapper = {
      Accuracy: "coloradAccuracy",
      Error: "coloredError",
      Latency: "coloredLatency",
      Cost: "coloredCost",
      "Real Call": "realCallCount",
      "Cached Call": "callFromCacheCount",
      "Full Cost": "resultsFullPrice",
      "Cached Cost": "resultsCurrentPrice"
    };

    return columns.map((column) => mapper[column]) as string[];
  }

  private columnSorting = {
    accuracy: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return row2.averageAccuracy - row1.averageAccuracy;
    },
    latency: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return row1.averageLatency - row2.averageLatency;
    },
    cost: (row1: MultipleRunResult, row2: MultipleRunResult) => {
      return currency(row1.averageCost, { precision: 10 }).subtract(
        row2.averageCost
      ).value;
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
    latency: {},
    getErrorColor: (value: number) => {
      if (value === 0) return "green";
      if (value <= 10) return "yellowBright";
      return "red";
    }
  };

  constructor(options?: {
    sortPriority?: SortableColumn[];
    hideColumns?: HideableColumn[];
  }) {
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

    const columnToHide =
      ResultPresenter.getColumnsToHide(options?.hideColumns) || [];

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
        "averageError",
        ...columnToHide
      ],
      sort: (row1, row2) => {
        const sort1Res = this.columnSorting[sortPriority[0]](row1, row2);
        if (sort1Res !== 0) return sort1Res;

        const sort2Res = this.columnSorting[sortPriority[1]](row1, row2);
        if (sort2Res !== 0) return sort2Res;

        const sort3Res = this.columnSorting[sortPriority[2]](row1, row2);
        if (sort3Res !== 0) return sort3Res;

        return this.columnSorting[sortPriority[3]](row1, row2);
      }
    });

    const possibleColumns = {
      cost: { name: "coloredCost", title: "Cost ($ cents)", alignment: "left" },
      latency: { name: "coloredLatency", title: "Latency (ms)" },
      accuracy: { name: "coloredAccuracy", title: "Accuracy (%)" },
      error: { name: "coloredError", title: "Error (%)" }
    };

    sortPriority.forEach((columnName) => {
      this.table.addColumn(possibleColumns[columnName]);
    });

    //@ts-expect-error it works fine
    this.table.addColumn({ name: "realCallCount", title: "Real Call" });
    //@ts-expect-error it works fine
    this.table.addColumn({
      name: "callFromCacheCount",
      title: "Cached Call"
    });
    //@ts-expect-error it works fine
    this.table.addColumn({
      name: "resultsFullPrice",
      title: "Full Cost ($ cents)",
      alignment: "left"
    });
    //@ts-expect-error it works fine
    this.table.addColumn({
      name: "resultsCurrentPrice",
      title: "Cost With Cache ($ cents)"
    });
  }

  addResults(data: MultipleRunResult[]) {
    data.forEach((rawRow) => {
      const accuracyColor = this.defaultThreshold.getAccuracyColor(
        rawRow.averageAccuracy
      );
      const errorColor = this.defaultThreshold.getErrorColor(
        rawRow.averageError
      );
      const coloredAccuracy = chalk[accuracyColor](rawRow.averageAccuracy);
      const coloredCost = rawRow.averageCost;
      const coloredLatency = Math.round(rawRow.averageLatency);
      const coloredError = chalk[errorColor](Math.round(rawRow.averageError));

      const row = {
        ...rawRow,
        coloredAccuracy: rawRow.averageError === 100 ? "N/A" : coloredAccuracy,
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
}
