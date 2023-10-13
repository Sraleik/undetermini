export class Undetermini {
  constructor() {}

  async run<T = any>(payload: {
    useCaseInput: T;
    useCase: (paylaod: T) => Promise<unknown>;
    expectedUseCaseOutput: Record<string, any>;
  }): Promise<{ latency: number }> {
    const { useCase, useCaseInput } = payload;

    const startTime = Date.now();
    await useCase(useCaseInput);
    const endTime = Date.now();
    const latency = endTime - startTime;

    return { latency: latency };
  }
}
