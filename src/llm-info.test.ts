import currency from "currency.js";
import {
  LLM_MODEL_NAME,
  ModelInfo,
  computeCostOfLlmCall,
  llmModelInfo
} from "./llm-utils";

it("should calculate the right price for a call to GPT3", async () => {
  const res = await computeCostOfLlmCall(
    LLM_MODEL_NAME.GPT_3_0613,
    "Yooooo, it's me !!",
    "effectivement c'est vous"
  );

  expect(res instanceof currency).toBe(true);
  expect(res.value).toEqual(0.0022);
});

it("should calculate the right price for a call to cohere", async () => {
  const res = await computeCostOfLlmCall(
    LLM_MODEL_NAME.COHERE_GENERATE,
    "Yooooo, it's me !!",
    "effectivement c'est vous"
  );

  expect(res instanceof currency).toBe(true);
  expect(res.value).toEqual(0.0022);
});

it("should calculate the right price for a call to GPT4", async () => {
  const res = await computeCostOfLlmCall(
    LLM_MODEL_NAME.GPT_4_0613,
    "Yooooo, it's me !!",
    "effectivement c'est vous"
  );

  expect(res instanceof currency).toBe(true);
  expect(res.value).toEqual(0.054);
});

it("should add a Model Info properly", () => {
  llmModelInfo.addModelInfo({
    name: "EXTREMELY_CHEAP_FAKE_MODEL",
    priceInCents: {
      input: 0.000000001,
      output: 0.000000002
    },
    rateLimit: {
      tpm: 1_000_000,
      rpm: 500_000
    }
  });

  //@ts-expect-error does exist
  expect(llmModelInfo.EXTREMELY_CHEAP_FAKE_MODEL as ModelInfo).toContain({
    name: "EXTREMELY_CHEAP_FAKE_MODEL"
  });
});
