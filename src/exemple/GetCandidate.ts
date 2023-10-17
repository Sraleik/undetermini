import { PromptTemplate } from "langchain/prompts";

export type Candidate = {
  firstname: string;
  lastname: string;
  age: number;
  profession: string;
};

export class GetCandidate {
  private promptTemplate: PromptTemplate;
  private formatInstruction: string;
  private extractCandidateFromPrompt: (prompt: string) => Promise<string>;
  private parser: (value: string) => Promise<Candidate>;

  constructor(payload: {
    promptTemplate: PromptTemplate;
    formatInstruction: string;
    extractCandidateFromPrompt: (prompt: string) => Promise<string>;
    parser: (value: string) => Promise<Candidate>;
  }) {
    this.promptTemplate = payload.promptTemplate;
    this.formatInstruction = payload.formatInstruction;
    this.extractCandidateFromPrompt = payload.extractCandidateFromPrompt;
    this.parser = payload.parser;
  }

  async execute(
    payload: { pdfAsText: string },
    handleCost?: (prompt: string, rawResult: string) => Promise<unknown>
  ) {
    const prompt = await this.promptTemplate.format({
      formatInstruction: this.formatInstruction,
      candidatePdfAsString: payload.pdfAsText
    });

    const rawResult = await this.extractCandidateFromPrompt(prompt);

    if (handleCost) {
      await handleCost(prompt, rawResult);
    }

    const res = await this.parser(rawResult);
    return res;
  }
}
