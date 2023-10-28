import currency from "currency.js";
import crypto from "crypto";

// Responsability: do everything related to this run
// returning: cost, latency, accuracy, error & hashes
export class UsecaseImplementation {
  private _currentRunCost = currency(0, { precision: 10 });

  static create(payload: {
    name: string;
    execute: (...args: any) => Promise<unknown>;
    usingServices?: string[];
  }) {
    const { name, execute } = payload;
    return new UsecaseImplementation(name, execute);
  }

  constructor(
    readonly name: string,
    private execute: (...args: any) => Promise<unknown>
  ) {}

  private resetCurrentRunCost() {
    this._currentRunCost = currency(0, { precision: 10 });
  }

  private computeAccuracyDefault(expectedOutput: any, output: any) {
    const expectedOutputType = typeof expectedOutput;
    const outputType = typeof output;

    if (expectedOutputType === "object" && outputType === "object") {
      let matchCount = 0;
      let totalKeys = 0;

      for (const key in expectedOutput) {
        totalKeys++;
        if (expectedOutput[key] === output[key]) {
          matchCount++;
        }
      }

      // Considering keys in responseJson that might not be in validJson
      for (const key in output) {
        if (!(key in expectedOutput)) {
          totalKeys++;
        }
      }

      return (matchCount / totalKeys) * 100;
    }
    return expectedOutput === output ? 100 : 0;
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

  async run(payload: { input?: unknown; expectedOutput: unknown }) {
    const { input, expectedOutput } = payload;
    this.resetCurrentRunCost();

    const startTime = Date.now();
    const { result, error } = await this.execute(input)
      .then((result) => ({
        result,
        error: undefined
      }))
      .catch((error) => ({
        error,
        result: undefined
      }));
    const endTime = Date.now();

    // Cost has to be return here, addCost is only accessible here at run time
    const cost = this._currentRunCost.value;

    //MAYBE: Since we save the result we could compute accuracy in undetermini
    const accuracy = this.computeAccuracyDefault(expectedOutput, result);
    //MAYBE: We could store startTime & endTime and compute latency in undetermini
    const latency = endTime - startTime;

    return {
      runId: await this.getRunHash(input),
      implementationId: await this.getImplementationHash(),
      inputId: await this.getInputHash(input),
      input,
      result,
      latency,
      cost,
      accuracy,
      error
    };
  }

  addCost(value: number) {
    this._currentRunCost = this._currentRunCost.add(
      currency(value, { precision: 10 })
    );
  }

  get currentRunCost() {
    return this._currentRunCost.value;
  }
}
