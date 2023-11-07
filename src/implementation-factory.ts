import { cartesianProduct } from "./common/math";
import { UsecaseImplementation } from "./usecase-implementation";

export type Method = {
  name: string;
  isActive: boolean;
  implementation: {
    name: string;
    value: unknown;
  };
  servicesUsed?: string[];
};

export type AddMethodPayload = Omit<Method, "isActive"> & {
  isActive?: boolean;
};

export abstract class UseCaseTemplate {
  abstract execute(...args: unknown[]): unknown;
}

export class ImplementationFactory {
  constructor(
    protected UseCase: new (...args: any[]) => UseCaseTemplate,
    readonly methods: Method[] = []
  ) {}

  addMethod(payload: AddMethodPayload) {
    const isImplementationExisting = !!this.methods.find(
      (method) => method.implementation.name === payload.implementation.name
    );
    if (isImplementationExisting)
      throw new Error("Implementation Name already exist");
    const isActive = payload.isActive ?? true;
    this.methods.push({ ...payload, isActive });
    const { name: methodName } = payload;

    //TODO: make sure this is necessary, a simple object of method might be enough
    if (!this[methodName]) {
      Object.defineProperty(this, methodName, {
        get: function () {
          const methods = this.methods.filter(
            (method: Method) => method.name === methodName && method.isActive
          ) as Method[];

          return methods;
        },
        enumerable: true
      });
    }
  }

  get methodsName() {
    return [...new Set(this.methods.map((method) => method.name))];
  }

  private get implementationsPayloadsAsArray() {
    const matrix = this.methodsName.map((methodName) => this[methodName]);
    return cartesianProduct(matrix) as Array<Array<Method>>;
  }

  get implementations() {
    return this.implementationsPayloadsAsArray.map((implementationPayload) => {
      const constructorPayload = implementationPayload.reduce((acc, method) => {
        acc[method.name] = method.implementation.value;
        return acc;
      }, {});

      const useCaseInstance = new this.UseCase(constructorPayload);
      const useCase = UsecaseImplementation.create({
        name: implementationPayload
          .map((method) => method.implementation.name)
          .join(", "),
        execute: useCaseInstance.execute
      });

      implementationPayload.forEach((method) => {
        useCase.addMethod(method);
      });

      return useCase;
    });
  }
}
