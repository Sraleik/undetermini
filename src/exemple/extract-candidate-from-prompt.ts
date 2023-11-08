import cohere from "cohere-ai";
import { OpenAI } from "langchain/llms/openai";
import {
  LLM_MODEL_NAME,
  OPENAI_MODEL_NAME,
  computeCostOfLlmCall
} from "../llm-utils";

export async function extractCandidateWithCohere(prompt: string) {
  cohere.init(process.env.COHERE_API_KEY!);

  const cohereResult = await cohere.generate({
    prompt,
    max_tokens: 1000,
    truncate: "END",
    return_likelihoods: "NONE"
  });

  //@ts-expect-error this does exist
  if (cohereResult.body.message) {
    //@ts-expect-error this does exist
    const error = new Error(cohereResult.body.message);
    throw error;
  }

  const rawResult = cohereResult.body.generations[0].text;

  const cost = computeCostOfLlmCall(
    LLM_MODEL_NAME.COHERE_GENERATE,
    prompt,
    rawResult
  );

  //@ts-expect-error this works thanks to undetermini magic ;)
  this.addCost(cost.value);
  return rawResult;
}

export async function extractCandidateWithGpt3(prompt: string) {
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

  const cost = computeCostOfLlmCall(LLM_MODEL_NAME.GPT_3_0613, prompt, result);
  //@ts-expect-error this works thanks to undetermini magic ;)
  this.addCost(cost.value);
  return result;
}

export async function extractCandidateWithGpt3Recent(prompt: string) {
  const llmModel = new OpenAI(
    {
      modelName: "gpt-3.5-turbo-1106",
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
    OPENAI_MODEL_NAME.GPT_3_1106,
    prompt,
    result
  );

  //@ts-expect-error this works thanks to undetermini magic ;)
  this.addCost(cost.value);
  return result;
}

export async function extractCandidateWithGpt4(prompt: string) {
  const llmModel = new OpenAI(
    {
      modelName: "gpt-4-0613",
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

  const cost = computeCostOfLlmCall(LLM_MODEL_NAME.GPT_4_0613, prompt, result);

  //@ts-expect-error this works thanks to undetermini magic ;)
  this.addCost(cost.value);
  return result;
}

export async function extractCandidateWithGpt4recent(prompt: string) {
  const llmModel = new OpenAI(
    {
      modelName: "gpt-4-1106-preview",
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
    OPENAI_MODEL_NAME.GPT_4_1106_PREVIEW,
    prompt,
    result
  );

  //@ts-expect-error this works thanks to undetermini magic ;)
  this.addCost(cost.value);
  return result;
}
