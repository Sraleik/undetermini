import { ImplementationFactory } from "./implementation-factory";
import { LLM_MODEL_NAME, computeCostOfLlmCall } from "./llm-utils";

it("should get the right cost of UseCaseTemplate with a costly method", async () => {
  class SimpleUseCaseTemplate {
    private multiply: (x: number, y: number) => number;
    private divide: (x: number, y: number) => number;

    constructor(payload: {
      multiply: (x: number, y: number) => number;
      divide: (x: number, y: number) => number;
    }) {
      this.multiply = payload.multiply;
      this.divide = payload.divide;
    }

    async execute(payload: { x: number; y: number }) {
      const { x, y } = payload;
      const multiplyRes = this.multiply(x, y);
      const divideRes = this.divide(multiplyRes, 5);

      return divideRes;
    }
  }

  const methods = [
    {
      name: "multiply",
      implementation: {
        name: "X * Y",
        value: (x: number, y: number) => x * y
      }
    },
    {
      name: "divide",
      implementation: {
        name: "Division through fake GPT3",
        value: async function (x: number, y: number) {
          const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
          const rawGPT3Result = `Here is your answer, you poor human: ${x / y}`;

          const cost = await computeCostOfLlmCall(
            LLM_MODEL_NAME.GPT_3_0613,
            inputPrompt,
            rawGPT3Result
          );

          this.addCost(cost);
          return x / y;
        }
      }
    }
  ];
  const simpleUseCaseFactory = new ImplementationFactory(SimpleUseCaseTemplate);
  simpleUseCaseFactory.addMethod(methods[0]);
  simpleUseCaseFactory.addMethod(methods[1]);

  const implementation = simpleUseCaseFactory.implementations;

  const { cost } = await implementation[0].run({
    input: { x: 5, y: 10 }
  });
  expect(cost).toBe(0.0052);
});

describe("Given a Factory with a simple TemplateUseCase", () => {
  class SimpleUseCaseTemplate {
    private multiply: (x: number, y: number) => number;
    private divide: (x: number, y: number) => number;

    constructor(payload: {
      multiply: (x: number, y: number) => number;
      divide: (x: number, y: number) => number;
    }) {
      this.multiply = payload.multiply;
      this.divide = payload.divide;
    }

    execute(payload: { x: number; y: number }) {
      const { x, y } = payload;
      const multiplyRes = this.multiply(x, y);
      const divideRes = this.divide(multiplyRes, 5);

      return divideRes;
    }
  }
  let simpleUseCaseFactory: ImplementationFactory;

  beforeEach(() => {
    simpleUseCaseFactory = new ImplementationFactory(SimpleUseCaseTemplate);
  });

  describe.each([
    {
      methods: [
        {
          name: "multiply",
          implementation: {
            name: "X * Y",
            value: (x: number, y: number) => x * y
          }
        },
        {
          name: "divide",
          implementation: {
            name: "Division through fake GPT3",
            value: async function (x: number, y: number) {
              const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
              const rawGPT3Result = `Here is your answer, you poor human: ${
                x / y
              }`;

              const cost = await computeCostOfLlmCall(
                LLM_MODEL_NAME.GPT_3_0613,
                inputPrompt,
                rawGPT3Result
              );

              this.addCost(cost);
              return x / y;
            }
          }
        }
      ],
      occurenceOfRequiredMethod: 1,
      implementationCount: 1
    },
    {
      methods: [
        {
          name: "multiply",
          implementation: {
            name: "X * Y",
            value: (x: number, y: number) => x * y
          }
        },
        {
          name: "multiply",
          implementation: {
            name: "Y * X",
            value: (x: number, y: number) => y * x
          }
        },
        {
          name: "divide",
          implementation: {
            name: "X / Y",
            value: async function (x: number, y: number) {
              const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
              const rawGPT3Result = `Here is your answer, you poor human: ${
                x / y
              }`;

              const cost = await computeCostOfLlmCall(
                LLM_MODEL_NAME.GPT_3_0613,
                inputPrompt,
                rawGPT3Result
              );
              this.addCost(cost.value);
              return x / y;
            }
          }
        },
        {
          name: "divide",
          implementation: {
            name: "X / Y duplicate",
            value: async function (x: number, y: number) {
              const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
              const rawGPT3Result = `Here is your answer, you poor human: ${
                x / y
              }`;

              const cost = await computeCostOfLlmCall(
                LLM_MODEL_NAME.GPT_3_0613,
                inputPrompt,
                rawGPT3Result
              );
              this.addCost(cost.value);
              return x / y;
            }
          }
        }
      ],
      occurenceOfRequiredMethod: 2,
      implementationCount: 4
    }
  ])(
    "When adding $occurenceOfRequiredMethod occurence of every required method",
    ({ methods, occurenceOfRequiredMethod, implementationCount }) => {
      beforeEach(() => {
        methods.forEach((method) => {
          simpleUseCaseFactory.addMethod(method);
        });
      });

      test(`Then the factory should have ${methods.length} Method in total`, async () => {
        expect(simpleUseCaseFactory.methods.length).toEqual(methods.length);
      });

      test("Then every methods should be active", async () => {
        expect(
          simpleUseCaseFactory.methods.every((method) => method.isActive)
        ).toEqual(true);
      });

      test(`Then it should have ${occurenceOfRequiredMethod} implementation of the method 'multiply'`, async () => {
        expect(simpleUseCaseFactory["multiply"].length).toEqual(
          occurenceOfRequiredMethod
        );
      });

      test(`Then it should have ${occurenceOfRequiredMethod} implementation of the method 'divide'`, async () => {
        expect(simpleUseCaseFactory["divide"].length).toEqual(
          occurenceOfRequiredMethod
        );
      });

      test(`Then it should have ${implementationCount} implementation of the UseCase`, async () => {
        expect(simpleUseCaseFactory.implementations.length).toEqual(
          implementationCount
        );
      });

      //@ts-expect-error runIf exist
      test.runIf(methods.length === 2)(
        `Then it should have the right name`,
        async () => {
          expect(simpleUseCaseFactory.implementations[0].name).toEqual(
            "X * Y, Division through fake GPT3"
          );
        }
      );

      describe(`Given the usecase${
        implementationCount > 1 ? "s are" : " is"
      } executed`, () => {
        let useCaseResult;
        let implementations;

        beforeEach(async () => {
          implementations = simpleUseCaseFactory.implementations;
          const resultPromise = implementations.map((implementation) => {
            return implementation.execute({
              x: 60,
              y: 100
            });
          });

          useCaseResult = await Promise.all(resultPromise);
        });
        test(`Then ${
          implementationCount > 1 ? "every usecases" : "it"
        } should return the result`, async () => {
          expect(useCaseResult.every((result) => result === 1200)).toEqual(
            true
          );
        });

        describe("Given one method of the usecase has a cost", () => {
          test(`Then the usecase${
            implementationCount > 1 ? "s" : ""
          } implementation should have the cost`, async () => {
            implementations.forEach((implementation) => {
              expect(implementation.getCurrentRunCost("default")).toEqual(
                0.00555
              );
            });
          });

          describe("Given the usecase is executed twice", () => {
            beforeEach(async () => {
              implementations = simpleUseCaseFactory.implementations;
              const resultPromise = implementations.map((implementation) => {
                return implementation.execute({
                  x: 60,
                  y: 100
                });
              });

              useCaseResult = await Promise.all(resultPromise);
            });
            test("Then the usecase implementation cost should have been reset to 0", async () => {
              implementations.forEach((implementation) => {
                expect(implementation.getCurrentRunCost("default")).toEqual(
                  0.00555
                );
              });
            });
          });
        });
      });
    }
  );

  describe("When adding a method with an existing implementationName", () => {
    test("Then the factory should throw an error", async () => {
      simpleUseCaseFactory.addMethod({
        name: "multiply",
        implementation: {
          name: "X * Y",
          value: (x: number, y: number) => x * y
        }
      });

      expect(() =>
        simpleUseCaseFactory.addMethod({
          name: "multiply",
          implementation: {
            name: "X * Y",
            value: (x: number, y: number) => x * y
          }
        })
      ).toThrow(/Implementation Name already exist/);
    });
  });
});
