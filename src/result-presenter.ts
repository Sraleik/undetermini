import { Table } from "console-table-printer";
import chalk from "chalk";
import currency from "currency.js";

export class ResultPresenter {
  private table: Table;
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

  constructor() {
    this.table = new Table({
      columns: [
        { name: "name", title: "Name", alignment: "left" },
        { name: "coloredAccuracy", title: "Average Accuracy (%)" },
        { name: "coloredLatency", title: "Average Latency (ms)" },
        { name: "coloredCost", title: "Average cost ($)" },
        { name: "averageAccuracy", title: "Average Accuracy (%)" },
        { name: "averageLatency", title: "Average Latency (ms)" },
        { name: "averageCost", title: "Average cost ($)" }
      ],
      disabledColumns: ["averageAccuracy", "averageLatency", "averageCost"],
      sort: (row1, row2) => {
        if (row1.averageAccuracy !== row2.averageAccuracy)
          return row2.averageAccuracy - row1.averageAccuracy;
        if (row1.averageLatency !== row2.averageLatency)
          return row1.averageLatency - row2.averageLatency;
        return currency(row1.averageCost, { precision: 10 }).subtract(
          row2.averageCost
        ).value;
      }
    });
  }

  displayResults(
    data: {
      name: string;
      averageCost: number;
      averageLatency: number;
      averageAccuracy: number;
    }[]
  ) {
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

    this.table.printTable();
  }

  get getAccuracyColor() {
    return this.defaultThreshold.getAccuracyColor;
  }
}
