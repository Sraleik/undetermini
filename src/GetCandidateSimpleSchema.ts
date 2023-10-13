import dotenv from "dotenv";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { encodingForModel } from "js-tiktoken";
import { LLM_MODEL_INFO, LLM_MODEL_NAME } from "./undetermini";
import { ulid } from "ulidx";

dotenv.config();

export class GetCandidateSimpleSchema {
  private heliconeApiKey = process.env.HELICONE_API_KEY;
  private openAIApiKey = process.env.OPEN_AI_API_KEY;
  private model: OpenAI;

  //TODO inject an interface instead of implementation
  constructor(private openAiModelName: LLM_MODEL_NAME) {
    this.model = new OpenAI(
      {
        modelName: this.openAiModelName,
        openAIApiKey: this.openAIApiKey
      },
      {
        basePath: "https://oai.hconeai.com/v1",
        baseOptions: {
          headers: {
            "Helicone-Auth": `Bearer ${this.heliconeApiKey}`,
            "Helicone-Property-Undetermini-Test": ulid(),
            "Helicone-Property-Schema": "simple"
          }
        }
      }
    );
  }

  async execute(
    payload: { pdfAsText: string },
    handleCost?: (cost: number) => Promise<unknown>
  ) {
    const promptTemplate = PromptTemplate.fromTemplate(
      `
			{candidatePdfAsString}

			I just give you above the content of a resume. Please 
			extract the relevant information following this instruction:

			{formatInstruction}
			`
    );

    const parser = StructuredOutputParser.fromNamesAndDescriptions({
      firstname: "the firstname of the candidate",
      lastname: "the lastname of the candidate",
      age: "the age of the candidate",
      profession: "the profession of the candidate"
    });
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    let priceInCents = 0;
    const enc = encodingForModel(this.openAiModelName);

    const result = await chain.invoke(
      {
        candidatePdfAsString: payload.pdfAsText,
        formatInstruction: parser.getFormatInstructions()
      },
      {
        callbacks: handleCost
          ? [
              {
                handleLLMStart: (_llm, prompts) => {
                  const inputTokenCount = enc.encode(prompts[0]).length;
                  priceInCents =
                    (inputTokenCount *
                      LLM_MODEL_INFO[this.openAiModelName].price.input1kToken) /
                    1000;
                },
                handleLLMEnd: (output) => {
                  const outputTokenCount = enc.encode(
                    output.generations[0][0].text
                  ).length;

                  priceInCents =
                    priceInCents +
                    (outputTokenCount *
                      LLM_MODEL_INFO[this.openAiModelName].price.input1kToken) /
                      1000;
                }
              }
            ]
          : undefined
      }
    );

    if (handleCost) {
      await handleCost(priceInCents);
    }

    return result;
  }
}
