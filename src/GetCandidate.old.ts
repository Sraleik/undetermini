import dotenv from "dotenv";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { OPENAI_MODEL_NAME } from "./undetermini";

dotenv.config();

export class GetCandidate {
  private heliconeApiKey = process.env.HELICONE_API_KEY;
  private openAIApiKey = process.env.OPEN_AI_API_KEY;
  private model: OpenAI;

  //TODO inject an interface instead of implementation
  constructor(private openAiModelName: OPENAI_MODEL_NAME) {
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
            "Helicone-Property-Schema": "zod"
          }
        }
      }
    );
  }

  async execute(
    payload: { pdfAsText: string },
    handleCost?: (prompt: string, rawResult: string) => Promise<unknown>
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

    const prompt = (
      await promptTemplate.format({
        candidatePdfAsString: payload.pdfAsText,
        formatInstruction: parser.getFormatInstructions()
      })
    ).trim();

    const rawResult = await this.model.call(prompt);

    if (handleCost) {
      await handleCost(prompt, rawResult);
    }

    return parser.parse(rawResult);
  }
}
