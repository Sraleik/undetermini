import { PromptTemplate } from "langchain/prompts";

export const promptTemplate1 = PromptTemplate.fromTemplate(`
{candidatePdfAsString}

I just give you above the content of a resume. Please
extract the relevant information following this instruction:

{formatInstruction}`);

export const promptTemplate2 = PromptTemplate.fromTemplate(`
{candidatePdfAsString}

Extract Candidate

{formatInstruction}`);

export const promptTemplate3 = PromptTemplate.fromTemplate(`
{candidatePdfAsString}

Extract firstname, lastname, age & profession 

{formatInstruction}`);
