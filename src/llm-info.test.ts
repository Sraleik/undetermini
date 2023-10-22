import currency from "currency.js";
import { LLM_MODEL_NAME, computeCostOfLlmCall } from "./llm-utils";

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
