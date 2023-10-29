import { Table } from "console-table-printer";
import chalk from "chalk";
import currency from "currency.js";
import { MultipleRunResult } from "./undetermini";

export class ResultPresenter {
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

  displayResults(payload: {
    data: MultipleRunResult[];
    options?: {
      sortPriority?: string[];
    };
  }) {
    const sortPriority = payload.options?.sortPriority || [
      "accuracy",
      "latency",
      "cost"
    ];

    const possibleColumns = {
      cost: { name: "coloredCost", title: "Average cost ($)" },
      latency: { name: "coloredLatency", title: "Average Latency (ms)" },
      accuracy: { name: "coloredAccuracy", title: "Average Accuracy (%)" }
    };

    const columnSorting = {
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

    const table = new Table({
      columns: [
        { name: "name", title: "Name", alignment: "left" },
        { name: "averageAccuracy", title: "Average Accuracy (%)" },
        { name: "averageLatency", title: "Average Latency (ms)" },
        { name: "averageCost", title: "Average cost ($)" }
      ],
      disabledColumns: ["averageAccuracy", "averageLatency", "averageCost"],
      sort: (row1, row2) => {
        const sort1Res = columnSorting[sortPriority[0]](row1, row2);
        if (sort1Res !== 0) return sort1Res;

        const sort2Res = columnSorting[sortPriority[1]](row1, row2);
        if (sort2Res !== 0) return sort1Res;

        return columnSorting[sortPriority[2]](row1, row2);
      }
    });

    sortPriority.forEach((columnName) => {
      table.addColumn(possibleColumns[columnName]);
    });

    const { data } = payload;
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
      table.addRow(row);
    });

    table.printTable();
    return table; //This is for test only
  }

  get getAccuracyColor() {
    return this.defaultThreshold.getAccuracyColor;
  }
}
