import { Table } from "console-table-printer";
import chalk from "chalk";
import currency from "currency.js";
import { MultipleRunResult } from "./undetermini";

export class ResultPresenter {
  private table: Table;

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
  };

  constructor(options?: { sortPriority?: string[] }) {
    const sortPriority = options?.sortPriority || [
      "accuracy",
      "latency",
      "cost"
    ];
    this.table = new Table({
      columns: [
        { name: "name", title: "Implementation Name", alignment: "left" },
        { name: "averageAccuracy" },
        { name: "averageLatency" },
        { name: "averageCost" }
      ],
      disabledColumns: ["averageAccuracy", "averageLatency", "averageCost"],
      sort: (row1, row2) => {
        const sort1Res = this.columnSorting[sortPriority[0]](row1, row2);
        if (sort1Res !== 0) return sort1Res;

        const sort2Res = this.columnSorting[sortPriority[1]](row1, row2);
        if (sort2Res !== 0) return sort1Res;

        return this.columnSorting[sortPriority[2]](row1, row2);
      }
    });

    const possibleColumns = {
      cost: { name: "coloredCost", title: "Average cost ($)" },
      latency: { name: "coloredLatency", title: "Average Latency (ms)" },
      accuracy: { name: "coloredAccuracy", title: "Average Accuracy (%)" }
    };

    sortPriority.forEach((columnName) => {
      this.table.addColumn(possibleColumns[columnName]);
    });
  }

  addResults(data: MultipleRunResult[]) {
    data.forEach((rawRow) => {
      const accuracyColor = this.getAccuracyColor(rawRow.averageAccuracy);
      const coloredAccuracy = chalk[accuracyColor](rawRow.averageAccuracy);
      const coloredCost = rawRow.averageCost;
      const coloredLatency = rawRow.averageLatency;

      const row = {
        ...rawRow,
        coloredAccuracy,
        coloredCost,
        coloredLatency
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
