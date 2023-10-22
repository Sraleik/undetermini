import { encodingForModel, TiktokenModel, Tiktoken } from "js-tiktoken";
import currency from "currency.js";
import { ValueOf } from "./common/utils";

export const OPENAI_MODEL_NAME = {
  GPT_4_0613: "gpt-4-0613",
  GPT_3_0613: "gpt-3.5-turbo-0613"
} as const;

export const LLM_MODEL_NAME = {
  ...OPENAI_MODEL_NAME,
  COHERE_GENERATE: "cohere-generate"
} as const;
export type LLM_MODEL_NAME = ValueOf<typeof LLM_MODEL_NAME>;
export type OPENAI_MODEL_NAME = ValueOf<typeof OPENAI_MODEL_NAME>;

export const LLM_MODEL_INFO = {
  "cohere-generate": {
    priceInCents: {
      input: currency(0.00015, { precision: 10 }),
      output: currency(0.0002, { precision: 10 })
    },
    rateLimit: {
      tpm: 100_000, // fake value I don't have them TODO: put undefined
      rpm: 50_000 // fake value I don't have them TODO: put undefined
    }
  },
  "gpt-4-0613": {
    priceInCents: {
      input: currency(0.003, { precision: 10 }),
      output: currency(0.006, { precision: 10 })
    },
    rateLimit: {
      tpm: 90_000,
      rpm: 3_500
    }
  },
  "gpt-3.5-turbo-0613": {
    priceInCents: {
      input: currency(0.00015, { precision: 10 }),
      output: currency(0.0002, { precision: 10 })
    },
    rateLimit: {
      tpm: 40_000,
      rpm: 500
    }
  }
} as const;

async function tokenCountForLlmModel(modelName: LLM_MODEL_NAME, text: string) {
  let enc: Tiktoken;
  if (modelName === "cohere-generate") {
    // For now this count token as if it was GPT3
    enc = encodingForModel(LLM_MODEL_NAME.GPT_3_0613);
    // Because this is doing an http call and require an api key
    // return (await cohere.tokenize({ text })).body.tokens.length;
  } else {
    enc = encodingForModel(modelName as TiktokenModel);
  }

  return enc.encode(text).length;
}

function costOfTokens(
  modelName: LLM_MODEL_NAME,
  type: "input" | "output",
  tokenCount: number
) {
  return LLM_MODEL_INFO[modelName].priceInCents[type].multiply(tokenCount);
}

export async function computeCostOfLlmCall(
  modelName: LLM_MODEL_NAME,
  inputPrompt: string,
  rawResult: string
) {
  const inputTokenCount = await tokenCountForLlmModel(modelName, inputPrompt);
  const outputTokenCount = await tokenCountForLlmModel(modelName, rawResult);

  const costOfInputToken = costOfTokens(modelName, "input", inputTokenCount);
  const costOfOutputToken = costOfTokens(modelName, "output", outputTokenCount);

  return costOfInputToken.add(costOfOutputToken);
}
