import { encodingForModel, Tiktoken } from "js-tiktoken";
import currency from "currency.js";

import { ValueOf } from "./common/utils";

export const OPENAI_MODEL_NAME = {
  GPT_4_1106_PREVIEW: "gpt-4-1106-preview",
  GPT_4_0613: "gpt-4-0613",
  GPT_3_0613: "gpt-3.5-turbo-0613",
  GPT_3_1106: "gpt-3.5-turbo-1106"
} as const;

export const LLM_MODEL_NAME = {
  ...OPENAI_MODEL_NAME,
  COHERE_GENERATE: "cohere-generate"
} as const;
export type LLM_MODEL_NAME = ValueOf<typeof LLM_MODEL_NAME>;
export type OPENAI_MODEL_NAME = ValueOf<typeof OPENAI_MODEL_NAME>;

export type ModelInfo = {
  name: string;
  priceInCents: {
    input: currency;
    output: currency;
  };
  rateLimit: {
    tpm: number;
    rpm: number;
  };
};

export type AddModelInfoPayload = {
  name: string;
  priceInCents: {
    input: number;
    output: number;
  };
  rateLimit: {
    tpm: number;
    rpm: number;
  };
};
class LlmModelInfo {
  readonly modelsInfo = {
    [LLM_MODEL_NAME.COHERE_GENERATE]: {
      name: LLM_MODEL_NAME.COHERE_GENERATE,
      tiktokenName: LLM_MODEL_NAME.GPT_3_0613,
      priceInCents: {
        input: currency(0.00015, { precision: 10 }),
        output: currency(0.0002, { precision: 10 })
      },
      rateLimit: {
        tpm: 100_000, // fake value I don't have them TODO: put undefined
        rpm: 10 // value for free version
      }
    },
    [LLM_MODEL_NAME.GPT_3_0613]: {
      name: LLM_MODEL_NAME.GPT_3_0613,
      tiktokenName: undefined,
      priceInCents: {
        input: currency(0.00015, { precision: 10 }),
        output: currency(0.0002, { precision: 10 })
      },
      rateLimit: {
        tpm: 40_000,
        rpm: 500
      }
    },
    [LLM_MODEL_NAME.GPT_3_1106]: {
      name: LLM_MODEL_NAME.GPT_3_1106,
      tiktokenName: LLM_MODEL_NAME.GPT_3_0613,
      priceInCents: {
        input: currency(0.0001, { precision: 10 }),
        output: currency(0.0002, { precision: 10 })
      },
      rateLimit: {
        tpm: 40_000,
        rpm: 500
      }
    },
    [LLM_MODEL_NAME.GPT_4_0613]: {
      name: LLM_MODEL_NAME.GPT_4_0613,
      tiktokenName: undefined,
      priceInCents: {
        input: currency(0.003, { precision: 10 }),
        output: currency(0.006, { precision: 10 })
      },
      rateLimit: {
        tpm: 90_000,
        rpm: 3_500
      }
    },
    [LLM_MODEL_NAME.GPT_4_1106_PREVIEW]: {
      name: LLM_MODEL_NAME.GPT_4_1106_PREVIEW,
      tiktokenName: LLM_MODEL_NAME.GPT_3_0613,
      priceInCents: {
        input: currency(0.001, { precision: 10 }),
        output: currency(0.003, { precision: 10 })
      },
      rateLimit: {
        tpm: 90_000,
        rpm: 3_500
      }
    }
  };

  addModelInfo(payload: AddModelInfoPayload) {
    const doesModelExist = Object.keys(this.modelsInfo).includes(payload.name);

    if (doesModelExist)
      throw new Error("Can not add an existing LLM model info");

    this.modelsInfo[payload.name] = {
      ...payload,
      priceInCents: {
        input: currency(payload.priceInCents.input, { precision: 10 }),
        output: currency(payload.priceInCents.output, { precision: 10 })
      }
    };
  }
}

export const llmModelInfo = new LlmModelInfo();

function tokenCountForLlmModel(modelName: LLM_MODEL_NAME, text: string) {
  let enc: Tiktoken;
  if (modelName === LLM_MODEL_NAME.COHERE_GENERATE) {
    // For now this count token as if it was GPT3
    enc = encodingForModel("gpt-3.5-turbo-0613");
    // Because this is doing an http call and require an api key
    // return (await cohere.tokenize({ text })).body.tokens.length;
  } else {
    const currentModelInfo = llmModelInfo.modelsInfo[modelName];
    const modelForTiktoken =
      currentModelInfo.tiktokenName || currentModelInfo.name;
    enc = encodingForModel(modelForTiktoken);
  }

  const res = enc.encode(text).length;
  return res;
}

function costOfTokens(
  modelName: LLM_MODEL_NAME,
  type: "input" | "output",
  tokenCount: number
) {
  return llmModelInfo.modelsInfo[modelName].priceInCents[type].multiply(
    tokenCount
  );
}

export function computeCostOfLlmCall(
  modelName: LLM_MODEL_NAME,
  inputPrompt: string,
  rawResult: string
) {
  const inputTokenCount = tokenCountForLlmModel(modelName, inputPrompt);
  const outputTokenCount = tokenCountForLlmModel(modelName, rawResult);

  const costOfInputToken = costOfTokens(modelName, "input", inputTokenCount);
  const costOfOutputToken = costOfTokens(modelName, "output", outputTokenCount);

  return costOfInputToken.add(costOfOutputToken);
}
