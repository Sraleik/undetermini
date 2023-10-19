import { ImplementationFactory } from "./implementation-factory";
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
//   methodName: "promptTemplate",
//   implementation: PromptTemplate.fromTemplate(`
//       {candidatePdfAsString}

//     	I just give you above the content of a resume. Please
//     	extract the relevant information following this instruction:

//     	{formatInstruction}`),
//   implementationName: "Prompt 1"
// });

// getCandidateFactory.addMethod({
//   methodName: "promptTemplate",
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
//   methodName: "formatInstruction",
//   implementation: parser1.getFormatInstructions(),
//   isActive: true,
//   implementationName: "Format Instruction: Zod"
// });

// getCandidateFactory.addMethod({
//   methodName: "parser",
//   implementation: parser1.parse.bind(parser1),
//   isActive: true,
//   implementationName: "Parser: Zod"
// });

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

  describe("When adding one occurence of every required method", () => {
    beforeEach(() => {
      simpleUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });
      simpleUseCaseFactory.addMethod({
        methodName: "divide",
        implementation: function (x: number, y: number) {
          this.addCost(12); // this function has a fixed cost of 12
          return x / y;
        },
        implementationName: "X / Y"
      });
    });

    test("Then the factory should have 2 Method in total", async () => {
      expect(simpleUseCaseFactory.methods.length).toEqual(2);
    });

    test("Then every methods should be active", async () => {
      expect(
        simpleUseCaseFactory.methods.every((method) => method.isActive)
      ).toEqual(true);
    });

    test("Then it should have 1 implementation of the method 'multiply'", async () => {
      expect(simpleUseCaseFactory["multiply"].length).toEqual(1);
    });

    test("Then it should have 1 implementation of the method 'divide'", async () => {
      expect(simpleUseCaseFactory["divide"].length).toEqual(1);
    });

    test("Then it should have 1 implementation of the UseCase", async () => {
      expect(simpleUseCaseFactory.implementations.length).toEqual(1);
    });

    describe("Given the use case is executed", () => {
      let useCaseResult;
      let implementation;
      beforeEach(async () => {
        implementation = simpleUseCaseFactory.implementations[0];
        useCaseResult = await implementation.execute({
          x: 6,
          y: 10
        });
      });
      test("Then it should return the result", async () => {
        expect(useCaseResult).toEqual(12);
      });

      describe("Given one method has a cost", () => {
        test("Then the usecase implementation should have the cost", async () => {
          expect(implementation.currentCost).toEqual(12);
        });

        describe("Given the usecase is executed twice", () => {
          test("Then the usecase implementation cost should have been reset to 0", async () => {
            expect(implementation.currentCost).toEqual(12);
          });
        });
      });
    });
  });

  describe("When adding a method with an existing implementationName", () => {
    test("Then the factory should throw an error", async () => {
      simpleUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });

      expect(() =>
        simpleUseCaseFactory.addMethod({
          methodName: "multiply",
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
