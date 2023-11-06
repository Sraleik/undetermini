import currency from "currency.js";
import { ImplementationFactory } from "./implementation-factory";
import { LLM_MODEL_NAME, computeCostOfLlmCall } from "./llm-utils";
// import dotenv from "dotenv";
// import { OpenAI } from "langchain/llms/openai";
// import cohere from "cohere-ai";
// import { OPENAI_MODEL_NAME } from "./undetermini";
// import { PromptTemplate } from "langchain/prompts";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import { z } from "zod";
// import { GetCandidate } from "./exemple/GetCandidate";

// dotenv.config();

// const extractCandidateWithGpt3 = (prompt: string) => {
//   const llmModel = new OpenAI(
//     {
//       modelName: OPENAI_MODEL_NAME.GPT_3_0613,
//       openAIApiKey: process.env.OPEN_AI_API_KEY
//     },
//     {
//       basePath: "https://oai.hconeai.com/v1",
//       baseOptions: {
//         headers: {
//           "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
//         }
//       }
//     }
//   );

//   return llmModel.call(prompt);
// };

// const extractCandidateWithGpt4 = (prompt: string) => {
//   const llmModel = new OpenAI(
//     {
//       modelName: OPENAI_MODEL_NAME.GPT_4_0613,
//       openAIApiKey: process.env.OPEN_AI_API_KEY
//     },
//     {
//       basePath: "https://oai.hconeai.com/v1",
//       baseOptions: {
//         headers: {
//           "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
//         }
//       }
//     }
//   );

//   return llmModel.call(prompt);
// };

// const extractCandidateWithCohere = async (prompt: string) => {
//   cohere.init(process.env.COHERE_API_KEY!);

//   const cohereResult = await cohere.generate({
//     prompt,
//     max_tokens: 100,
//     truncate: "END",
//     return_likelihoods: "NONE"
//   });

//   const rawResult = cohereResult.body.generations[0].text;

//   return rawResult;
// };

// const getCandidateFactory = new ImplementationFactory(GetCandidate);
// // Prompt Template
// getCandidateFactory.addMethod({
//   name: "promptTemplate",
//   implementation: PromptTemplate.fromTemplate(`
//       {candidatePdfAsString}

//     	I just give you above the content of a resume. Please
//     	extract the relevant information following this instruction:

//     	{formatInstruction}`),
//   implementationName: "Prompt 1"
// });

// getCandidateFactory.addMethod({
//   name: "promptTemplate",
//   implementation: PromptTemplate.fromTemplate(`
//       {candidatePdfAsString}

//       Extract Candidate

//     	{formatInstruction}`),
//   isActive: false,
//   implementationName: "Prompt 2"
// });

// const parser1 = StructuredOutputParser.fromZodSchema(
//   z.object({
//     firstname: z.string().describe("the firstname of the candidate"),
//     lastname: z.string().describe("the lastname of the candidate"),
//     age: z.number({ coerce: true }).describe("the age of the candidate"),
//     profession: z.string().describe("the profession of the candidate")
//   })
// );

// getCandidateFactory.addMethod({
//   name: "formatInstruction",
//   implementation: parser1.getFormatInstructions(),
//   isActive: true,
//   implementationName: "Format Instruction: Zod"
// });

// getCandidateFactory.addMethod({
//   name: "parser",
//   implementation: parser1.parse.bind(parser1),
//   isActive: true,
//   implementationName: "Parser: Zod"
// });

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
      implementation: (x: number, y: number) => x * y,
      implementationName: "X * Y"
    },
    {
      name: "divide",
      implementation: async function (x: number, y: number) {
        const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
        const rawGPT3Result = `Here is your answer, you poor human: ${x / y}`;

        const cost = await computeCostOfLlmCall(
          LLM_MODEL_NAME.GPT_3_0613,
          inputPrompt,
          rawGPT3Result
        );

        this.addCost(cost);
        return x / y;
      },
      llmModelNamesUsed: [LLM_MODEL_NAME.GPT_3_0613],
      implementationName: "Division through fake GPT3"
    }
  ];
  const simpleUseCaseFactory = new ImplementationFactory(SimpleUseCaseTemplate);
  simpleUseCaseFactory.addMethod(methods[0]);
  simpleUseCaseFactory.addMethod(methods[1]);

  const implementation = simpleUseCaseFactory.implementations;

  const { cost } = await implementation[0].run({
    input: { x: 5, y: 10 },
    expectedOutput: 10
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
  let simpleUseCaseFactory: ImplementationFactory<SimpleUseCaseTemplate>;

  beforeEach(() => {
    simpleUseCaseFactory = new ImplementationFactory(SimpleUseCaseTemplate);
  });

  describe.each([
    {
      methods: [
        {
          name: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "X * Y"
        },
        {
          name: "divide",
          implementation: async function (x: number, y: number) {
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
          },
          llmModelNamesUsed: [LLM_MODEL_NAME.GPT_3_0613],
          implementationName: "Division through fake GPT3"
        }
      ],
      occurenceOfRequiredMethod: 1,
      implementationCount: 1
    },
    {
      methods: [
        {
          name: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "X * Y"
        },
        {
          name: "multiply",
          implementation: (x: number, y: number) => y * x,
          implementationName: "Y * X"
        },
        {
          name: "divide",
          implementation: async function (x: number, y: number) {
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
          },
          implementationName: "X / Y"
        },
        {
          name: "divide",
          implementation: async function (x: number, y: number) {
            const inputPrompt = `Please lord GPT can you divide ${x} by ${y}, I would be eternally grateful`;
            const rawGPT3Result = `Here is your answer, you poor human: ${
              x / y
            }`;

            const cost = await computeCostOfLlmCall(
              LLM_MODEL_NAME.GPT_3_0613,
              inputPrompt,
              rawGPT3Result
            );
            console.log(
              "🚀 ~ file: implementation-factory.test.ts:279 ~ cost:",
              cost
            );
            this.addCost(cost.value);
            return x / y;
          },
          implementationName: "X / Y duplicate"
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

      //@ts-expect-error runIf exist
      // test.runIf(methods.length === 2)(
      //   `Then it should have the right modelNames`,
      //   async () => {
      //     const implementation = simpleUseCaseFactory.implementations[0];
      //     expect(implementation.llmModelNamesUsed).toContain(
      //       LLM_MODEL_NAME.GPT_3_0613
      //     );
      //   }
      // );

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
              expect(implementation.currentRunCost).toEqual(0.00555);
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
                expect(implementation.currentRunCost).toEqual(0.00555);
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
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });

      expect(() =>
        simpleUseCaseFactory.addMethod({
          name: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "X * Y"
        })
      ).toThrow();
    });
  });
});

// Then the implementation factory should have the right method implementation

// eslint-disable-next-line @typescript-eslint/ban-types
// function hashFunction(func: Function): string {
//   const functionString = func.toString();
//   const hash = crypto.createHash("sha256");
//   hash.update(functionString);
//   return hash.digest("hex");
// }

// // eslint-disable-next-line @typescript-eslint/ban-types
// function getFunctionCode(fn: Function): string {
//   return fn.toString();
// }

// function serializeInstance(instance: any): string {
//   const proto = Object.getPrototypeOf(instance);
//   const protoProps = Object.getOwnPropertyNames(proto)
//     .filter((prop) => typeof proto[prop] === "function")
//     .map((prop) => `${prop}:${getFunctionCode(proto[prop])}`);
//   const instanceProps = Object.keys(instance).map(
//     (prop) => `${prop}:${instance[prop]}`
//   );
//   return JSON.stringify([...instanceProps, ...protoProps]);
// }

// function generateHash(instance: any): string {
//   const serialized = serializeInstance(instance);
//   const hash = crypto.createHash("sha256");
//   hash.update(serialized);
//   return hash.digest("hex");
// }

// console.log(generateHash(getCandidateFactory.implementations[0]));
// console.log(generateHash(getCandidateFactory.implementations[1]));

// const results = await undetermini.run<UseCaseInput>({
//   useCaseInput,
//   expectedUseCaseOutput,
//   implementations,
//   times: 2
// });
// console.table(results);
