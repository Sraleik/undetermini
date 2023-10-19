import { ImplementationFactory } from "./GetCandidateImplementationFactory";
import * as crypto from "crypto";
import dotenv from "dotenv";
import { OpenAI } from "langchain/llms/openai";
import cohere from "cohere-ai";
import { Undetermini, OPENAI_MODEL_NAME } from "../undetermini";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { GetCandidate } from "./GetCandidate";
import { LLM_MODEL_NAME } from "../undetermini";

dotenv.config();

const undetermini = new Undetermini();

const extractCandidateWithGpt3 = (prompt: string) => {
  const llmModel = new OpenAI(
    {
      modelName: OPENAI_MODEL_NAME.GPT_3_0613,
      openAIApiKey: process.env.OPEN_AI_API_KEY
    },
    {
      basePath: "https://oai.hconeai.com/v1",
      baseOptions: {
        headers: {
          "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
        }
      }
    }
  );

  return llmModel.call(prompt);
};

const extractCandidateWithGpt4 = (prompt: string) => {
  const llmModel = new OpenAI(
    {
      modelName: OPENAI_MODEL_NAME.GPT_4_0613,
      openAIApiKey: process.env.OPEN_AI_API_KEY
    },
    {
      basePath: "https://oai.hconeai.com/v1",
      baseOptions: {
        headers: {
          "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
        }
      }
    }
  );

  return llmModel.call(prompt);
};

const extractCandidateWithCohere = async (prompt: string) => {
  cohere.init(process.env.COHERE_API_KEY!);

  const cohereResult = await cohere.generate({
    prompt,
    max_tokens: 100,
    truncate: "END",
    return_likelihoods: "NONE"
  });

  const rawResult = cohereResult.body.generations[0].text;

  return rawResult;
};

const getCandidateFactory = new ImplementationFactory(GetCandidate);
// Prompt Template
getCandidateFactory.addMethod({
  methodName: "promptTemplate",
  implementation: PromptTemplate.fromTemplate(`
      {candidatePdfAsString}

    	I just give you above the content of a resume. Please
    	extract the relevant information following this instruction:

    	{formatInstruction}`),
  implementationName: "Prompt 1"
});

getCandidateFactory.addMethod({
  methodName: "promptTemplate",
  implementation: PromptTemplate.fromTemplate(`
      {candidatePdfAsString}

      Extract Candidate

    	{formatInstruction}`),
  isActive: false,
  implementationName: "Prompt 2"
});

// Extract Data With LLM
getCandidateFactory.addMethod({
  methodName: "extractCandidateFromPrompt",
  implementation: extractCandidateWithGpt3,
  modelName: OPENAI_MODEL_NAME.GPT_3_0613,
  implementationName: "LLM Model: GPT 3"
});

getCandidateFactory.addMethod({
  methodName: "extractCandidateFromPrompt",
  implementation: extractCandidateWithGpt4,
  isActive: true,
  modelName: OPENAI_MODEL_NAME.GPT_4_0613,
  implementationName: "LLM Model: GPT 4"
});

getCandidateFactory.addMethod({
  methodName: "extractCandidateFromPrompt",
  implementation: extractCandidateWithCohere,
  isActive: false,
  modelName: LLM_MODEL_NAME.COHERE_GENERATE,
  implementationName: "LLM Model: COHERE"
});

const parser1 = StructuredOutputParser.fromZodSchema(
  z.object({
    firstname: z.string().describe("the firstname of the candidate"),
    lastname: z.string().describe("the lastname of the candidate"),
    age: z.number({ coerce: true }).describe("the age of the candidate"),
    profession: z.string().describe("the profession of the candidate")
  })
);

getCandidateFactory.addMethod({
  methodName: "formatInstruction",
  implementation: parser1.getFormatInstructions(),
  isActive: true,
  implementationName: "Format Instruction: Zod"
});

getCandidateFactory.addMethod({
  methodName: "parser",
  implementation: parser1.parse.bind(parser1),
  isActive: true,
  implementationName: "Parser: Zod"
});

describe("Given a Factory with a simple TemplateUseCase", () => {
  class SimpleUseCaseTemplate {
    constructor(
      private multiply: (x, y) => number,
      private divide: (x, y) => number
    ) {}

    execute(payload: { x: number; y: number }) {
      const { x, y } = payload;
      const multiplyRes = this.multiply(x, y);
      const divideRes = this.divide(multiplyRes, 5);

      return divideRes;
    }
  }
  let uselessUseCaseFactory: ImplementationFactory<SimpleUseCaseTemplate>;

  beforeEach(() => {
    uselessUseCaseFactory = new ImplementationFactory(SimpleUseCaseTemplate);
  });

  describe("When adding 1 implementation of a Method named 'multiply'", () => {
    beforeEach(() => {
      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });
    });

    test("Then the factory should have 1 Method in total", async () => {
      expect(uselessUseCaseFactory.methods.length).toEqual(1);
    });

    test("Then it should have 1 Active Method", async () => {
      expect(uselessUseCaseFactory.methods[0].isActive).toEqual(true);
    });

    test("Then it should have 1 implementation of the method 'multiply'", async () => {
      expect(uselessUseCaseFactory["multiply"].length).toEqual(1);
    });
  });

  describe("When adding a method with an existing implementationName", () => {
    test("Then the factory should throw an error", async () => {
      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });

      expect(() =>
        uselessUseCaseFactory.addMethod({
          methodName: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "X * Y"
        })
      ).toThrow();
    });
  });

  describe("When adding a method with an existing implementationName", () => {
    test("Then the factory should throw an error", async () => {
      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });

      expect(() =>
        uselessUseCaseFactory.addMethod({
          methodName: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "X * Y"
        })
      ).toThrow();
    });
  });

  describe("When adding 3 implementation of a Method named 'multiply'", () => {
    beforeEach(() => {
      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x * y,
        implementationName: "X * Y"
      });
      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => y * x,
        implementationName: "Y * X"
      });

      uselessUseCaseFactory.addMethod({
        methodName: "multiply",
        implementation: (x: number, y: number) => x / y,
        implementationName: "Wrong: x / y"
      });
    });

    describe("When adding 1 inactive Method", () => {
      beforeEach(() => {
        uselessUseCaseFactory.addMethod({
          methodName: "multiply",
          implementation: (x: number, y: number) => x * y,
          implementationName: "Inactive: X * Y",
          isActive: false
        });
      });

      test("Then the factory should have 1 more Method in methods", async () => {
        expect(uselessUseCaseFactory.methods.length).toEqual(4);
      });

      test("Then number of methods in 'multiply' should remain the same", async () => {
        expect(uselessUseCaseFactory["multiply"].length).toEqual(3);
      });
    });

    describe("When adding 3 implementation of a Method named 'divide'", () => {
      beforeEach(() => {
        uselessUseCaseFactory.addMethod({
          methodName: "divide",
          implementation: (x: number, y: number) => x / y,
          implementationName: "X / Y"
        });
        uselessUseCaseFactory.addMethod({
          methodName: "divide",
          implementation: (x: number, y: number) => y / x,
          implementationName: "Y / X"
        });

        uselessUseCaseFactory.addMethod({
          methodName: "divide",
          implementation: (x: number, y: number) => x * y,
          implementationName: "Wrong: x * y"
        });
      });

      test("Then the factory should have 6 Method", async () => {
        expect(uselessUseCaseFactory.methods.length).toEqual(6);
      });

      test("Then it should have 3 implementation of the method 'divide'", async () => {
        expect(uselessUseCaseFactory["divide"].length).toEqual(3);
      });
      test("Then every methods should be active", async () => {
        expect(
          uselessUseCaseFactory.methods.every((method) => method.isActive)
        ).toBe(true);
      });
    });

    test("Then the factory should have 3 Method", async () => {
      expect(uselessUseCaseFactory.methods.length).toEqual(3);
    });

    test("Then it should have 3 implementation of the method 'multiply'", async () => {
      expect(uselessUseCaseFactory["multiply"].length).toEqual(3);
    });

    test("Then every methods should be active", async () => {
      expect(
        uselessUseCaseFactory.methods.every((method) => method.isActive)
      ).toBe(true);
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
