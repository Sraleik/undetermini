import { StructuredOutputParser } from "langchain/output_parsers";
import { PromptTemplate } from "langchain/prompts";
import { z } from "zod";
import { Candidate, GetCandidate } from "./GetCandidate";

export type Strategy<T, V> = {
  type: T;
  name: string;
  value: V;
};

// GetCandidateImplementationFactory
export class GetCandidateImplementationFactory {
  private readonly promptTemplates: Array<
    Strategy<"Prompt Template", PromptTemplate>
  > = [];
  private readonly formatInstructions: Array<
    Strategy<"Format Instruction", string>
  > = [];
  private readonly extractCandidateFromPrompt: Array<
    Strategy<"Extract Candidate", (prompt: string) => Promise<string>>
  > = [];
  private readonly parsers: Array<
    Strategy<"Parser", (value: string) => Promise<Candidate>>
  > = [];

  addPromptTemplate(name: string, promptTemplate: PromptTemplate) {
    const nameAlreadyExist = !!this.promptTemplates.find(
      (promptTemplate) => promptTemplate.name === name
    );
    if (nameAlreadyExist)
      throw new Error("This prompt template name already exist");

    this.promptTemplates.push({
      type: "Prompt Template",
      name,
      value: promptTemplate
    });
  }

  addFormatInstruction(name: string, formatInstruction: string) {
    this.formatInstructions.push({
      type: "Format Instruction",
      name,
      value: formatInstruction
    });
  }

  addExtractCandidate(
    name: string,
    extractCandidate: (prompt: string) => Promise<string>
  ) {
    this.extractCandidateFromPrompt.push({
      type: "Extract Candidate",
      name,
      value: extractCandidate
    });
  }

  addParser(name: string, parser: (value: string) => Promise<Candidate>) {
    this.parsers.push({
      type: "Parser",
      name,
      value: parser
    });
  }

  constructor() {
    const parser1 = StructuredOutputParser.fromZodSchema(
      z.object({
        firstname: z.string().describe("the firstname of the candidate"),
        lastname: z.string().describe("the lastname of the candidate"),
        age: z.number({ coerce: true }).describe("the age of the candidate"),
        profession: z.string().describe("the profession of the candidate")
      })
    );

    this.addPromptTemplate(
      "Prompt 1",
      PromptTemplate.fromTemplate(`
      {candidatePdfAsString}

    	I just give you above the content of a resume. Please
    	extract the relevant information following this instruction:

    	{formatInstruction}`)
    );

    this.addFormatInstruction("Zod", parser1.getFormatInstructions());
    this.addParser("Zod", parser1.parse.bind(parser1));
  }

  generateAllGetCandidateImplementation() {
    const implementations: any[] = [];

    for (const template of this.promptTemplates) {
      for (const instruction of this.formatInstructions) {
        for (const extractor of this.extractCandidateFromPrompt) {
          for (const parser of this.parsers) {
            const implem = new GetCandidate(
              template.value,
              instruction.value,
              extractor.value,
              parser.value
            );
            implementations.push({
              name: `${template.name}, ${instruction.name}, ${extractor.name}, ${parser.name}`,
              modelName: extractor.name,
              execute: implem.execute.bind(implem)
            });
          }
        }
      }
    }

    return implementations;
  }
}
