import { ImplementationFactory } from "../implementation-factory";
import { GetCandidate } from "./GetCandidate";
import { Undetermini } from "../undetermini";
import { formatInstruction1, formatInstruction2 } from "./format-instruction";
import {
  promptTemplate1,
  promptTemplate2,
  promptTemplate3
} from "./prompt-template";
import { parser1, parser2 } from "./parser";
import {
  extractCandidateWithGpt3,
  extractCandidateWithCohere,
  extractCandidateWithGpt3Recent,
  extractCandidateWithGpt4,
  extractCandidateWithGpt4recent
} from "./extract-candidate-from-prompt";

const getCandidateFactory = new ImplementationFactory(GetCandidate);

getCandidateFactory.addMethod({
  isActive: false,
  name: "promptTemplate",
  implementation: {
    name: "Prompt 1: (long)",
    value: promptTemplate1
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "promptTemplate",
  implementation: {
    name: "Prompt 2: (concise)",
    value: promptTemplate2
  }
});

getCandidateFactory.addMethod({
  isActive: true,
  name: "promptTemplate",
  implementation: {
    name: "Prompt 3: (concise2)",
    value: promptTemplate3
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "formatInstruction",
  implementation: {
    name: "Format Instruction: Zod",
    value: formatInstruction1
  }
});

getCandidateFactory.addMethod({
  isActive: true,
  name: "formatInstruction",
  implementation: {
    name: "Format Instruction: JSON",
    value: formatInstruction2
  }
});

getCandidateFactory.addMethod({
  isActive: true,
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "LLM: GPT 3 old",
    value: extractCandidateWithGpt3
  }
});

getCandidateFactory.addMethod({
  isActive: true,
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "LLM: GPT 3 recent",
    value: extractCandidateWithGpt3Recent
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "LLM: GPT 4 old",
    value: extractCandidateWithGpt4
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "LLM: GPT 4 recent",
    value: extractCandidateWithGpt4recent
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "extractCandidateFromPrompt",
  implementation: {
    name: "LLM: Cohere",
    value: extractCandidateWithCohere
  }
});

getCandidateFactory.addMethod({
  isActive: false,
  name: "parser",
  implementation: {
    name: "Parser: Zod",
    value: parser1
  }
});

getCandidateFactory.addMethod({
  isActive: true,
  name: "parser",
  implementation: {
    name: "Parser: JSON",
    value: parser2
  }
});

it("should work splendidly", async () => {
  const implementations = getCandidateFactory.implementations;

  const undetermini = await Undetermini.create({
    persistOnDisk: true,
    filename: "get-candidate-db.json"
  });

  const res = await undetermini.run({
    useCaseInput: {
      pdfAsText: "Nicolas Rotier 32 years old Software Engineer"
    },
    implementations,
    expectedUseCaseOutput: {
      firstname: "Nicolas",
      lastname: "Rotier",
      age: 32,
      profession: "Software Engineer"
    },
    times: 10,
    presenter: {
      isActive: true,
      options: {
        sortPriority: ["error"]
      }
    },
    useCache: false
  });
  expect(res).toBeTruthy();
}, 60000);
