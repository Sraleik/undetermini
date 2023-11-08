import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { ImplementationFactory } from "../implementation-factory";
import { GetCandidate } from "./GetCandidate";
import { z } from "zod";
import { Undetermini } from "../undetermini";
import { OPENAI_MODEL_NAME, computeCostOfLlmCall } from "../llm-utils";

const getCandidateFactory = new ImplementationFactory(GetCandidate);

getCandidateFactory.addMethod({
  name: "promptTemplate",
  implementation: {
    name: "Prompt 1",
    value: PromptTemplate.fromTemplate(`
      {candidatePdfAsString}

     	I just give you above the content of a resume. Please
     	extract the relevant information following this instruction:

     	{formatInstruction}`)
  }
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
  name: "formatInstruction",
  implementation: {
    name: "Format Instruction: Zod",
    value: parser1.getFormatInstructions()
  }
});

async function extractCandidateWithGpt3(prompt: string) {
  const llmModel = new OpenAI(
    {
      modelName: "gpt-3.5-turbo-0613",
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

  const result = await llmModel.call(prompt);

  const cost = computeCostOfLlmCall(
    OPENAI_MODEL_NAME.GPT_3_0613,
    prompt,
    result
  );
  this.addCost(cost.value);
  return result;
}

getCandidateFactory.addMethod({
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "GPT 3",
    value: extractCandidateWithGpt3
  }
});

getCandidateFactory.addMethod({
  name: "parser",
  implementation: {
    name: "Zod",
    value: parser1.parse.bind(parser1)
  }
});

it.skip("should work splendidly", async () => {
  const implementations = getCandidateFactory.implementations;

  expect(implementations.length).toBe(1);

  const implementation1 = implementations[0];
  const undetermini = await Undetermini.create({ persistOnDisk: true });

  const res = await undetermini.run({
    useCaseInput: {
      pdfAsText: "Nicolas Rotier 32 years old Software Engineer"
    },
    implementations: [implementation1],
    expectedUseCaseOutput: {
      firstname: "Nicolas",
      lastname: "Rotier",
      age: 32,
      profession: "Software Engineer"
    },
    times: 11,
    presenter: {
      isActive: true
    },
    useCache: true
  });
  expect(res).toBeTruthy();
}, 60000);
