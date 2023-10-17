import { GetCandidate } from "./GetCandidate";

export type Method = {
  methodName: string;
  implementationName: string;
  modelName?: string;
  isActive: boolean;
  implementation: any;
};

export function cartesianProduct(arrays: any[][]): any[][] {
  // Base case: if there are no arrays or any of them is empty, return an empty array
  if (arrays.length === 0 || arrays.some((array) => array.length === 0)) {
    return [];
  }

  // Recursive case
  function cartesianHelper(arrays: any[][], index: number): any[][] {
    // If we've processed all arrays, return an array containing an empty tuple
    if (index === arrays.length) {
      return [[]];
    }

    // Compute the Cartesian product of the remaining arrays
    const remainingProduct = cartesianHelper(arrays, index + 1);

    // Prepend each element of the current array to each tuple of the remaining product
    const result: any[][] = [];
    for (const item of arrays[index]) {
      for (const tuple of remainingProduct) {
        result.push([item, ...tuple]);
      }
    }

    return result;
  }

  return cartesianHelper(arrays, 0);
}

export class ImplementationFactory<T> {
  constructor(
    protected UseCaseConstructor: new (...args: any[]) => T,
    protected methods: Method[] = []
  ) {}

  addMethod(payload: Method) {
    this.methods.push(payload);
    const { methodName } = payload;
    if (!this[methodName]) {
      Object.defineProperty(this, methodName, {
        get: function () {
          return this.methods.filter(
            (method: Method) => method.methodName === methodName
          );
        }
      });
    }
  }

  get methodsName() {
    return [...new Set(this.methods.map((method) => method.methodName))];
  }

  private get implementationsPayloadsAsArray() {
    const matrix = this.methodsName.map((methodName) => this[methodName]);
    return cartesianProduct(matrix) as Array<Array<Method>>;
  }

  get implementations() {
    class UseCaseExtended extends this.UseCaseConstructor {
      constructor(
        private readonly implementationName: string,
        payload: any
      ) {
        super(payload);
      }
    }
    return this.implementationsPayloadsAsArray.map((implementationPayload) => {
      const constructorPayload = implementationPayload.reduce((acc, method) => {
        acc[method.methodName] = method.implementation;
        return acc;
      }, {});
      const methodImplementationsName = implementationPayload.reduce(
        (acc, method) => {
          acc.push(method.implementationName);
          return acc;
        },
        [] as Array<string>
      );
      const useCase = new UseCaseExtended(
        methodImplementationsName.join(", "),
        constructorPayload
      );
      // Object.getPrototypeOf(useCase).implementationName =
      return useCase;
    }) as unknown as Array<GetCandidate>;
  }
}
