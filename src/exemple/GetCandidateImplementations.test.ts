import { GetCandidateImplementationFactory } from "./GetCandidateImplementationFactory";
import dotenv from "dotenv";
import { OpenAI } from "langchain/llms/openai";
import cohere from "cohere-ai";
import { Undetermini, OPENAI_MODEL_NAME, LLM_MODEL_NAME } from "../undetermini";

dotenv.config();

const undetermini = new Undetermini();

const getCandidateImplementationFactory =
  new GetCandidateImplementationFactory();

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

getCandidateImplementationFactory.addExtractCandidate(
  OPENAI_MODEL_NAME.GPT_3_0613,
  extractCandidateWithGpt3
);

getCandidateImplementationFactory.addExtractCandidate(
  OPENAI_MODEL_NAME.GPT_4_0613,
  extractCandidateWithGpt4
);

// getCandidateImplementationFactory.addExtractCandidate(
//   LLM_MODEL_NAME.COHERE_GENERATE,
//   extractCandidateWithCohere
// );

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

  const implementations =
    getCandidateImplementationFactory.generateAllGetCandidateImplementation();

  console.log(
    "🚀 ~ file: GetCandidateImplementations.test.ts:86 ~ it ~ implementations:",
    implementations
  );

  const results = await undetermini.run<UseCaseInput>({
    useCaseInput,
    expectedUseCaseOutput,
    implementations,
    times: 2
  });
  console.table(results);
}, 60_000);
