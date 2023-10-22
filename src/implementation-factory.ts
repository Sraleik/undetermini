import currency from "currency.js";

export type Method = {
  //MAYBE: call it id
  methodName: string;
  isActive: boolean;
  llmModelNamesUsed?: string[];
  implementationName: string;
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
    public methods: Method[] = [];
    private _currentCost = currency(0, { precision: 10 });

    constructor(...args: any[]) {
      super(...args);
    }

    async execute(paylaod: any) {
      this._currentCost = currency(0, { precision: 10 });
      const res = await super.execute(paylaod);
      return res;
    }

    get implementationName() {
      return this.methods.map((method) => method.implementationName).join(", ");
    }

    get llmModelNamesUsed() {
      if (!this.methods.length) return;
      const llmModelNames = new Set<string>();
      this.methods
        .filter((method) => method.llmModelNamesUsed)
        .forEach((method) => {
          method.llmModelNamesUsed?.forEach((llmModelName) => {
            llmModelNames.add(llmModelName);
          });
        });

      return Array.from(llmModelNames);
    }

    get currentCost() {
      return this._currentCost.value;
    }

    setMethods(methods: Method[]) {
      this.methods = methods;
    }

    addCost(value: currency) {
      this._currentCost = this._currentCost.add(value);
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

      const useCase = new this.ExtendedUseCase(constructorPayload);
      useCase.setMethods(implementationPayload);

      return useCase;
    });
  }
}
