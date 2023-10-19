export type Method = {
  //MAYBE: call it id
  methodName: string;
  implementationName: string;
  isActive: boolean;
  implementation: any;
};

export type AddMethodPayload = Omit<Method, "isActive"> & {
  isActive?: boolean;
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

function createClass(Base: new (...args: any[]) => any) {
  return class extends Base {
    // should not be public
    public implementationName: string | undefined;
    public currentCost: number = 0;

    constructor(...args: any[]) {
      super(...args);
    }

    async execute(paylaod: any) {
      this.currentCost = 0;
      const res = await super.execute(paylaod);
      return res;
    }

    setImplementationName(implementationName: string) {
      this.implementationName = implementationName;
    }

    addCost(value: number) {
      this.currentCost += value;
    }
  };
}

export class ImplementationFactory<T> {
  readonly ExtendedUseCase;

  constructor(
    protected UseCase: new (...args: any[]) => T,
    readonly methods: Method[] = []
  ) {
    this.ExtendedUseCase = createClass(this.UseCase);
  }

  addMethod(payload: AddMethodPayload) {
    const isImplementationExisting = !!this.methods.find(
      (method) => method.implementationName === payload.implementationName
    );
    if (isImplementationExisting)
      throw new Error("Implementation Name already exist");
    const isActive = payload.isActive ?? true;
    this.methods.push({ ...payload, isActive });
    const { methodName } = payload;
    if (!this[methodName]) {
      Object.defineProperty(this, methodName, {
        get: function () {
          const methods = this.methods.filter(
            (method: Method) =>
              method.methodName === methodName && method.isActive
          ) as Method[];

          return methods;
        },
        enumerable: true
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
      const useCase = new this.ExtendedUseCase(constructorPayload);
      useCase.setImplementationName(methodImplementationsName.join(", "));

      return useCase;
    });
  }
}
