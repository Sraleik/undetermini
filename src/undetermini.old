import { LLM_MODEL_NAME, Undetermini } from "./undetermini";
import { GetCandidate } from "./GetCandidate";
import { GetCandidateCohere } from "./GetCandidateCohere";
import { GetCandidateSimpleSchema } from "./GetCandidateSimpleSchema";

const undetermini = new Undetermini();

const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;

const gpt4GetCandidate = new GetCandidate("gpt-4-0613");
const gpt4useCase = gpt4GetCandidate.execute.bind(gpt4GetCandidate);

const gpt3GetCandidate = new GetCandidate("gpt-3.5-turbo-0613");
const gpt3useCase = gpt4GetCandidate.execute.bind(gpt3GetCandidate);

const gpt4GetCandidateSimpleSchema = new GetCandidateSimpleSchema("gpt-4-0613");
const gpt4SimpleSchemaUseCase = gpt4GetCandidate.execute.bind(
  gpt4GetCandidateSimpleSchema
);

const gpt3GetCandidateSimpleSchema = new GetCandidateSimpleSchema(
  "gpt-3.5-turbo-0613"
);
const gpt3SimpleSchemaUseCase = gpt4GetCandidate.execute.bind(
  gpt3GetCandidateSimpleSchema
);

const cohereGetCandidateZod = new GetCandidateCohere();
const cohereGetCandidateZodUseCase = cohereGetCandidateZod.execute.bind(
  cohereGetCandidateZod
);

it(
  "should return the latency of use-case",
  async () => {
    const useCaseInput = {
      pdfAsText: `
			Nicolas Rotier
			32 years old
			Nantes

			Software Engineer  
	`
    };
    const times = 5;
    const output = await undetermini.run<typeof useCaseInput>({
      times,
      useCaseInput,
      useCases: [
        {
          name: "GetCandidateZod (gpt-4-0613)",
          execute: gpt4useCase,
          modelName: LLM_MODEL_NAME.GPT_4_0613
        },
        {
          name: "GetCandidateZod (gpt-3.5-0613)",
          execute: gpt3useCase,
          modelName: LLM_MODEL_NAME.GPT_3_0613
        },
        {
          name: "GetCandidateSimpleSchema (gpt-3.5-0613)",
          execute: gpt3SimpleSchemaUseCase,
          modelName: LLM_MODEL_NAME.GPT_3_0613
        },
        {
          name: "GetCandidateZod(cohere-generate)",
          execute: cohereGetCandidateZodUseCase,
          modelName: LLM_MODEL_NAME.COHERE_GENERATE
        },
        {
          name: "GetCandidateSimpleSchema (gpt-4-0613)",
          execute: gpt4SimpleSchemaUseCase,
          modelName: LLM_MODEL_NAME.GPT_4_0613
        }
      ],
      expectedUseCaseOutput: {
        firstname: "Nicolas",
        lastname: "Rotier",
        age: 32,
        profession: "Software Engineer"
      }
    });

    console.log(`Use case have been run x${times} times`);
    console.table(output);

    expect(true).toBe(true);
  },
  50 * ONE_MINUTE
);
