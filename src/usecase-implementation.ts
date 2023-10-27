import currency from "currency.js";

// Responsability: do everything related to this run
// returning: cost, latency, accuracy & error
export class UsecaseImplementation {
  private _currentRunCost = currency(0, { precision: 10 });

  static create(payload: {
    name: string;
    execute: (...args: any) => Promise<unknown>;
  }) {
    const { name, execute } = payload;
    const usecaseImplementation = new UsecaseImplementation(name, execute);
    // execute.bind(usecaseImplementation);
    return usecaseImplementation;
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

  async run(payload: { input?: any; expectedOutput: any }) {
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

    const latency = endTime - startTime;
    const cost = this._currentRunCost.value;
    const accuracy = this.computeAccuracyDefault(expectedOutput, result);

    return {
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
