import dotenv from "dotenv";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { encodingForModel } from "js-tiktoken";

dotenv.config();

export class GetCandidate {
  private heliconeApiKey = process.env.HELICONE_API_KEY;
  private openAIApiKey = process.env.OPEN_AI_API_KEY;
  private model: OpenAI;

  private LLM_PRICE = {
    "gpt-4-0613": { input1kToken: 3, output1kToken: 6 },
    "gpt-3.5-turbo-0613": { input1kToken: 0.15, output1kToken: 0.2 }
  };

  //TODO inject an interface instead of implementation
  constructor(private openAiModelName: string) {
    this.model = new OpenAI(
      {
        modelName: this.openAiModelName,
        openAIApiKey: this.openAIApiKey
      },
      {
        basePath: "https://oai.hconeai.com/v1",
        baseOptions: {
          headers: {
            "Helicone-Auth": `Bearer ${this.heliconeApiKey}`
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

    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        firstname: z.string().describe("the firstname of the candidate"),
        lastname: z.string().describe("the lastname of the candidate"),
        age: z.number().describe("the age of the candidate"),
        profession: z.string().describe("the profession of the candidate")
      })
    );
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    let priceInCents = 0;
    const enc = encodingForModel("gpt-4-0613");

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
                      this.LLM_PRICE[this.openAiModelName].input1kToken) /
                    1000;
                },
                handleLLMEnd: (output) => {
                  const outputTokenCount = enc.encode(
                    output.generations[0][0].text
                  ).length;

                  priceInCents =
                    priceInCents +
                    (outputTokenCount *
                      this.LLM_PRICE[this.openAiModelName].input1kToken) /
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
