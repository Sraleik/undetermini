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
  isActive: true,
  implementationName: "Prompt 1"
});

getCandidateFactory.addMethod({
  methodName: "promptTemplate",
  implementation: PromptTemplate.fromTemplate(`
      {candidatePdfAsString}

      Extract Candidate

    	{formatInstruction}`),
  isActive: true,
  implementationName: "Prompt 2"
});

// Extract Data With LLM
getCandidateFactory.addMethod({
  methodName: "extractCandidateFromPrompt",
  implementation: extractCandidateWithGpt3,
  isActive: true,
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
  isActive: true,
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

it("should return the proper candidate", async () => {
  // Given a value given to our use case
  const useCaseInput = {
    pdfAsText: "Nicolas Rotier Software Engineer 32 years old"
  };
  type UseCaseInput = typeof useCaseInput;

  // Given an expected output (here we expect the string to be lowercase)
  const expectedUseCaseOutput = {
    firstname: "Nicolas",
    lastname: "Rotier",
    age: 32,
    profession: "Software Engineer"
  };

  const implementations = getCandidateFactory.implementations.map(
    (getCandidate) => {
      return {
        name: (getCandidate as any).implementationName,
        modelName: OPENAI_MODEL_NAME.GPT_3_0613,
        execute: getCandidate.execute.bind(getCandidate)
      };
    }
  );
  console.log(
    "🚀 ~ file: GetCandidateImplementations.spec.ts:169 ~ it ~ implementations:",
    implementations
  );

  // eslint-disable-next-line @typescript-eslint/ban-types
  function hashFunction(func: Function): string {
    const functionString = func.toString();
    const hash = crypto.createHash("sha256");
    hash.update(functionString);
    return hash.digest("hex");
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  function getFunctionCode(fn: Function): string {
    return fn.toString();
  }

  function serializeInstance(instance: any): string {
    const proto = Object.getPrototypeOf(instance);
    const protoProps = Object.getOwnPropertyNames(proto)
      .filter((prop) => typeof proto[prop] === "function")
      .map((prop) => `${prop}:${getFunctionCode(proto[prop])}`);
    const instanceProps = Object.keys(instance).map(
      (prop) => `${prop}:${instance[prop]}`
    );
    return JSON.stringify([...instanceProps, ...protoProps]);
  }

  function generateHash(instance: any): string {
    const serialized = serializeInstance(instance);
    const hash = crypto.createHash("sha256");
    hash.update(serialized);
    return hash.digest("hex");
  }

  console.log(generateHash(getCandidateFactory.implementations[0]));
  console.log(generateHash(getCandidateFactory.implementations[1]));

  // const results = await undetermini.run<UseCaseInput>({
  //   useCaseInput,
  //   expectedUseCaseOutput,
  //   implementations,
  //   times: 2
  // });
  // console.table(results);
}, 60_000);
