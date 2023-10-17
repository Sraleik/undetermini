import dotenv from "dotenv";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import cohere from "cohere-ai";
import { z } from "zod";

dotenv.config();

export class GetCandidateCohere {
  constructor() {
    cohere.init(process.env.COHERE_API_KEY!);
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

    const cohereResult = await cohere.generate({
      prompt,
      max_tokens: 100,
      truncate: "END",
      return_likelihoods: "NONE"
    });

    const rawResult = cohereResult.body.generations[0].text;

    if (handleCost) {
      await handleCost(prompt, rawResult);
    }

    const res = await parser.parse(rawResult);

    return res;
  }
}
