import loki from "lokijs";
import { Prettify } from "./common/utils";

export type RunResult = {
  runId: string;
  implementationId: string;
  inputId: string;
  input: unknown;
  result?: unknown;
  accuracy: number;
  latency: number;
  cost: number;
  error?: Error;
  runnedAt?: Date;
};

export class RunResultRepository {
  private db: loki;
  private executionResult: loki.Collection;

  constructor(private persistOnDisk = false) {
    const option = this.persistOnDisk
      ? {
          autosave: false,
          throttledSaves: true
        }
      : undefined;
    this.db = new loki("undetermini-db.json", option);

    this.executionResult = this.db.getCollection("execution-results");
    this.databaseInitialize();
  }

  private databaseInitialize() {
    if (this.executionResult === null) {
      this.executionResult = this.db.addCollection("execution-results");
      if (this.persistOnDisk) {
        this.db.saveDatabase();
      }
    }
  }

  addRunResult(payload: Prettify<RunResult>) {
    return new Promise((resolve, reject) => {
      const {
        runId,
        implementationId,
        inputId,
        input,
        result,
        accuracy,
        latency,
        cost,
        error
      } = payload;
      const runnedAt = new Date();

      this.executionResult.insert({
        runId,
        implementationId,
        inputId,
        input,
        result,
        accuracy,
        latency,
        cost,
        error,
        runnedAt
      });

      if (this.persistOnDisk) {
        this.db.saveDatabase((error: Error) => {
          if (error) reject(error);
          resolve(undefined);
        });
      } else {
        resolve(undefined);
      }
    });
  }

  async getRunResults(payload: { runId: string }) {
    const results = this.executionResult
      .find({
        runId: payload.runId
      })
      .map((lokiResult: any) => {
        return {
          runId: lokiResult.runId,
          implementationId: lokiResult.implementationId,
          inputId: lokiResult.inputId,
          input: lokiResult.input,
          result: lokiResult.result,
          accuracy: lokiResult.accuracy,
          latency: lokiResult.latency,
          cost: lokiResult.cost,
          error: lokiResult.error ? new Error(lokiResult.error) : undefined,
          runnedAt: new Date(lokiResult.runnedAt)
        };
      });
    return results;
  }
}
