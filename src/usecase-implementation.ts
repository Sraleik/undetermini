import currency from "currency.js";
import crypto from "crypto";
import { Method } from "./implementation-factory";
import { Prettify } from "./common/utils";

// Responsability: do everything related to this run
// returning: cost, latency, accuracy, error & hashes
export class UsecaseImplementation {
  private _currentRunCost = currency(0, { precision: 10 });

  static create(payload: {
    name: string;
    execute: (...args: any) => unknown;
    usingServices?: string[];
  }) {
    const { name, execute } = payload;
    const useCase = new UsecaseImplementation(name, execute);
    execute.bind(this);
    return useCase;
  }

  constructor(
    readonly name: string,
    private execute: (...args: any) => unknown
  ) {}

  addMethod(method: Prettify<Method>) {
    if (typeof method.implementation.value === "function") {
      this[method.name] = method.implementation.value.bind(this);
    } else {
      this[method.name] = method.implementation.value;
    }
  }

  addCost(value: number) {
    this._currentRunCost = this._currentRunCost.add(
      currency(value, { precision: 10 })
    );
  }

  get currentRunCost() {
    return this._currentRunCost.value;
  }

  private resetCurrentRunCost() {
    this._currentRunCost = currency(0, { precision: 10 });
  }

  private sortAndStringify(value: any) {
    if (typeof value === "function") {
      return value.toString();
    }
    return typeof value === "object" && value !== null
      ? JSON.stringify(
          Object.keys(value)
            .sort()
            .reduce((result, key) => {
              result[key] = value[key];
              return result;
            }, {})
        )
      : JSON.stringify(value);
  }
  private dataToUint8Array(data: unknown) {
    const inputStringified = this.sortAndStringify(data);
    const encoder = new TextEncoder();
    return encoder.encode(inputStringified);
  }

  async getInputHash(input: unknown) {
    const inputData = this.dataToUint8Array(input);

    const hash = crypto.createHash("sha256");
    hash.update(inputData);
    return hash.digest("hex");
  }
  async getImplementationHash() {
    const functionData = this.dataToUint8Array(this.execute);

    const hash = crypto.createHash("sha256");
    hash.update(functionData);
    return hash.digest("hex");
  }
  async getRunHash(input: any) {
    const functionData = this.dataToUint8Array(this.execute);
    const inputData = this.dataToUint8Array(input);

    const hash = crypto.createHash("sha256");
    hash.update(functionData);
    hash.update(inputData);

    return hash.digest("hex");
  }

  async run(payload?: { input?: unknown }) {
    const input = payload?.input;
    this.resetCurrentRunCost();

    const startTime = Date.now();
    let result: unknown = undefined;
    let error: Error | undefined = undefined;
    try {
      result = await this.execute(input);
    } catch (e: unknown) {
      error = e as Error;
    }
    const endTime = Date.now();

    // Cost has to be return here, addCost is only accessible here at run time
    const cost = this._currentRunCost.value;

    const latency = endTime - startTime;

    return {
      runId: await this.getRunHash(input),
      implementationId: await this.getImplementationHash(),
      inputId: await this.getInputHash(input),
      input,
      result,
      latency,
      cost,
      error
    };
  }
}
