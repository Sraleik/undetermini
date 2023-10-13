export class Undetermini {
  private test: string = "coucou";

  constructor() {
    console.log(
      "🚀 ~ file: undetermini.interface.ts:4 ~ Undetermini ~ test:",
      test
    );
    this.test = "osef";
  }

  get coucou() {
    return this.test;
  }
}
