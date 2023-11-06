import { cartesianProduct } from "./common/math";
import { UsecaseImplementation } from "./usecase-implementation";

export type Method = {
  //MAYBE: call it id
  name: string;
  isActive: boolean;
  // TODO change this to implementation: {name: string, value: () => any}
  implementationName: string;
  implementation: any;
  //TODO replace llmModelNamesUsed by servicesUsed
  llmModelNamesUsed?: string[];
  servicesUsed?: {
    name: string[];
    addCost: (...args: unknown[]) => Promise<unknown>;
  }[];
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
      (method) => method.implementationName === payload.implementationName
    );
    if (isImplementationExisting)
      throw new Error("Implementation Name already exist");
    const isActive = payload.isActive ?? true;
    this.methods.push({ ...payload, isActive });
    const { name: methodName } = payload;
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
        acc[method.name] = method.implementation;
        return acc;
      }, {});

      const useCaseInstance = new this.UseCase(constructorPayload);
      const useCase = UsecaseImplementation.create({
        name: implementationPayload
          .map((method) => method.implementationName)
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
