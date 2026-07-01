import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    firstname: z.string().describe("the firstname of the candidate"),
    lastname: z.string().describe("the lastname of the candidate"),
    age: z.number({ coerce: true }).describe("the age of the candidate"),
    profession: z.string().describe("the profession of the candidate")
  })
);

export const parser1 = parser.parse.bind(parser);

export const parser2 = function (rawResult: string) {
  return JSON.parse(rawResult.replace("```json", "").replace("```", ""));
};
