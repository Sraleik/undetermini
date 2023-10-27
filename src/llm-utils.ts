import { encodingForModel, TiktokenModel, Tiktoken } from "js-tiktoken";
import currency from "currency.js";
import { ValueOf } from "./common/utils";

export const OPENAI_MODEL_NAME = {
  GPT_4_0613: "GPT_4_0613",
  GPT_3_0613: "GPT_3_5_TURBO_0613"
} as const;

export const LLM_MODEL_NAME = {
  ...OPENAI_MODEL_NAME,
  COHERE_GENERATE: "COHERE_GENERATE"
} as const;
export type LLM_MODEL_NAME = ValueOf<typeof LLM_MODEL_NAME>;
export type OPENAI_MODEL_NAME = ValueOf<typeof OPENAI_MODEL_NAME>;

export type ModelInfo = {
  name: string;
  tiktokenName?: TiktokenModel;
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
  tiktokenName?: TiktokenModel;
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
  private modelsInfo: ModelInfo[] = [
    {
      name: LLM_MODEL_NAME.COHERE_GENERATE,
      priceInCents: {
        input: currency(0.00015, { precision: 10 }),
        output: currency(0.0002, { precision: 10 })
      },
      rateLimit: {
        tpm: 100_000, // fake value I don't have them TODO: put undefined
        rpm: 50_000 // fake value I don't have them TODO: put undefined
      }
    },
    {
      name: LLM_MODEL_NAME.GPT_3_0613,
      tiktokenName: "gpt-3.5-turbo-0613",
      priceInCents: {
        input: currency(0.00015, { precision: 10 }),
        output: currency(0.0002, { precision: 10 })
      },
      rateLimit: {
        tpm: 40_000,
        rpm: 500
      }
    },
    {
      name: LLM_MODEL_NAME.GPT_4_0613,
      tiktokenName: "gpt-4-0613",
      priceInCents: {
        input: currency(0.003, { precision: 10 }),
        output: currency(0.006, { precision: 10 })
      },
      rateLimit: {
        tpm: 90_000,
        rpm: 3_500
      }
    }
  ];

  get COHERE_GENERATE() {
    return this.modelsInfo.find(
      (modelInfo) => modelInfo.name === LLM_MODEL_NAME.COHERE_GENERATE
    );
  }

  get GPT_4_0613() {
    return this.modelsInfo.find(
      (modelInfo) => modelInfo.name === LLM_MODEL_NAME.GPT_4_0613
    );
  }

  get GPT_3_5_TURBO_0613() {
    return this.modelsInfo.find(
      (modelInfo) => modelInfo.name === LLM_MODEL_NAME.GPT_3_0613
    );
  }

  addModelInfo(payload: AddModelInfoPayload) {
    const doesModelExist = !!this.modelsInfo.find(
      (modelInfo) => modelInfo.name === payload.name
    );

    if (doesModelExist)
      throw new Error("Can not add an existing LLM model info");

    this.modelsInfo.push({
      ...payload,
      priceInCents: {
        input: currency(payload.priceInCents.input, { precision: 10 }),
        output: currency(payload.priceInCents.output, { precision: 10 })
      }
    });

    const modelName = payload.name;
    if (!this[modelName]) {
      Object.defineProperty(this, modelName, {
        get: function () {
          const methods = this.modelsInfo.find(
            (modelInfo: ModelInfo) => modelInfo.name === modelName
          );

          return methods;
        },
        enumerable: true
      });
    }
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
    llmModelInfo[modelName]?.tiktokenName;
    enc = encodingForModel(
      llmModelInfo[modelName]?.tiktokenName as TiktokenModel
    );
  }

  return enc.encode(text).length;
}

function costOfTokens(
  modelName: LLM_MODEL_NAME,
  type: "input" | "output",
  tokenCount: number
) {
  //@ts-expect-error all good
  return llmModelInfo[modelName].priceInCents[type].multiply(tokenCount);
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
