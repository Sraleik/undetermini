import loki from "lokijs";
import { Prettify } from "./common/utils";

export type RunResult = {
  runId: string;
  implementationId: string;
  inputId: string;
  input: unknown;
  latency: number;
  cost: number;
  result?: unknown;
  error?: Error;
  runnedAt?: Date;
};

export class RunResultRepository {
  private db: loki;
  private executionResult: loki.Collection;

  static async create(options?: {
    filename?: string;
    persistOnDisk?: boolean;
  }) {
    const { persistOnDisk, filename } = options || {};
    const repo = new RunResultRepository(persistOnDisk, filename);
    await repo.databaseInitialize();
    return repo;
  }

  private constructor(
    private persistOnDisk = false,
    filename = "undetermini-db.json"
  ) {
    const option = this.persistOnDisk
      ? {
          autosave: false,
          throttledSaves: true
        }
      : undefined;
    this.db = new loki(filename, option);
    this.executionResult = this.db.getCollection("execution-results");
  }

  private databaseInitialize() {
    return new Promise((resolve, reject) => {
      this.db.loadDatabase({}, (error: Error) => {
        if (error) reject(error);
        this.executionResult = this.db.getCollection("execution-results");

        if (!this.executionResult) {
          this.executionResult = this.db.addCollection("execution-results");
          if (this.persistOnDisk) {
            this.db.saveDatabase((error: Error) => {
              if (error) reject(error);
              resolve(undefined);
            });
          } else {
            resolve(undefined);
          }
        } else {
          resolve(undefined);
        }
      });
    });
  }

  addRunResult(payload: Prettify<RunResult & { name: string }>) {
    return new Promise((resolve, reject) => {
      const {
        runId,
        implementationId,
        inputId,
        name,
        input,
        result,
        latency,
        cost,
        error,
        runnedAt
      } = payload;

      this.executionResult.insert({
        runId,
        implementationId,
        inputId,
        name,
        input,
        result,
        latency,
        cost,
        error,
        runnedAt: runnedAt || new Date()
      });

      if (this.persistOnDisk) {
        this.db.saveDatabase((error: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        });
      } else {
        resolve(undefined);
      }
    });
  }
  async getRunResultsCount(payload: { runId: string }) {
    const results = this.executionResult.count({
      runId: payload.runId
    });
    return results;
  }

  async getLastRunResults(payload: { runId: string; limit: number }) {
    const results = this.executionResult
      .chain()
      .find({
        runId: payload.runId
      })
      .simplesort("runnedAt", { desc: true })
      .limit(payload.limit)
      .data()
      .map((lokiResult: any) => {
        let error: Error | undefined;
        if (lokiResult.error) {
          if (Object.keys(lokiResult.error).length === 0) {
            error = new Error("Unknown reason");
          } else {
            error = new Error(lokiResult.error);
          }
        }
        return {
          runId: lokiResult.runId,
          implementationId: lokiResult.implementationId,
          inputId: lokiResult.inputId,
          input: lokiResult.input,
          result: lokiResult.result,
          latency: lokiResult.latency,
          cost: lokiResult.cost,
          error,
          runnedAt: new Date(lokiResult.runnedAt)
        };
      });
    return results as RunResult[];
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
          latency: lokiResult.latency,
          cost: lokiResult.cost,
          error: lokiResult.error ? new Error(lokiResult.error) : undefined,
          runnedAt: new Date(lokiResult.runnedAt)
        };
      });
    return results;
  }
}
