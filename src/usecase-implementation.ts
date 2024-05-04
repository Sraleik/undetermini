import currency from "currency.js";
import sha from "sha.js";
import { createId } from "./common/utils";
import { Method } from "./implementation-factory";
import { Prettify } from "./common/utils";

// Responsability: do everything related to this run
// returning: cost, latency, accuracy, error & hashes
export class UsecaseImplementation {
  private _currentRunCost = new Map<string, currency>();
  //TODO: like "addMethod" find a better name. 'itemHashes' maybe
  private methodHashes: Record<string, string> = {};

  static create(payload: { name: string; execute: (...args: any) => unknown }) {
    const { name, execute } = payload;
    const useCase = new UsecaseImplementation(name, execute);
    execute.bind(this);
    return useCase;
  }

  constructor(
    readonly name: string,
    private execute: (...args: any) => unknown
  ) {
    this._currentRunCost.set("default", currency(0, { precision: 10 }));
  }

  //TODO find a better name because it can add other things than method
  //MAYBE I should store method in an array of Methods and add the hash at this time
  addMethod(method: Prettify<Method>) {
    if (typeof method.implementation.value === "function") {
      this[method.name] = method.implementation.value.bind(this);
    } else {
      this[method.name] = method.implementation.value;
    }

    this.methodHashes[method.name] = this.getHash(method.implementation.value);
  }

  //TODO remove the default
  addCost(value: number, callId: string) {
    if (!callId) {
      const currentCost = this._currentRunCost.get("default")!.value;
      if (typeof currentCost === "number") {
        this._currentRunCost.set(
          "default",
          currency(currentCost, { precision: 10 }).add(value)
        );
      }
    } else {
      const currentCost = this._currentRunCost.get(callId);
      if (typeof currentCost === "number") {
        this._currentRunCost.set(
          callId,
          currency(currentCost, { precision: 10 }).add(value)
        );
      } else {
        this._currentRunCost.set(callId, currency(value, { precision: 10 }));
      }
    }
  }

  getCurrentRunCost(callId: string) {
    const callHasCost = this._currentRunCost.has(callId);
    if (callHasCost) return this._currentRunCost.get(callId)!.value;
    return this._currentRunCost.get("default")!.value;
  }

  private resetCurrentRunCost() {
    this._currentRunCost.set("default", currency(0, { precision: 10 }));
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

  getHash(input: unknown) {
    const inputData = this.dataToUint8Array(input);

    const hash = sha("sha256");
    hash.update(inputData);
    return hash.digest("hex");
  }
  getImplementationHash() {
    const methodsHash = this.getHash(this.methodHashes);
    const executeHash = this.getHash(this.execute);

    const hash = sha("sha256");
    hash.update(methodsHash);
    hash.update(executeHash);
    return hash.digest("hex");
  }
  getRunHash(input: any) {
    const implementationHash = this.getImplementationHash();
    const inputHash = this.getHash(input);

    const hash = sha("sha256");
    hash.update(implementationHash);
    hash.update(inputHash);

    return hash.digest("hex");
  }

  async run(payload?: { input?: unknown }) {
    //TODO: do better than a callID, this is a hacky way to fix addCost in parrallel on same instance
    this.resetCurrentRunCost();
    const callId = createId();
    const input = payload?.input;

    const startTime = Date.now();
    let result: unknown = undefined;
    let error: Error | undefined = undefined;
    try {
      result = await this.execute(input, callId);
    } catch (e: unknown) {
      error = e as Error;
    }
    const endTime = Date.now();

    // Cost has to be return here, addCost is only accessible here at run time
    const cost = this.getCurrentRunCost(callId);
    const latency = endTime - startTime;

    return {
      runId: this.getRunHash(input),
      implementationId: this.getImplementationHash(),
      inputId: this.getHash(input),
      input,
      result,
      latency,
      cost,
      error
    };
  }
}
