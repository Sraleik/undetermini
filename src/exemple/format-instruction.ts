import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

const parser1 = StructuredOutputParser.fromZodSchema(
  z.object({
    firstname: z.string().describe("the firstname of the candidate"),
    lastname: z.string().describe("the lastname of the candidate"),
    age: z.number({ coerce: true }).describe("the age of the candidate"),
    profession: z.string().describe("the profession of the candidate")
  })
);

export const formatInstruction1 = parser1.getFormatInstructions();

export const formatInstruction2 =
  "return the answer in json format. your answer should start with this ```json";
