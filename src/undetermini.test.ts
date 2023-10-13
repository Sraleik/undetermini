import { LLM_MODEL_NAME, Undetermini } from "./undetermini";
import { GetCandidate } from "./GetCandidate";

const undetermini = new Undetermini();

const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;

const gpt4GetCandidate = new GetCandidate("gpt-4-0613");
const gpt4useCase = gpt4GetCandidate.execute.bind(gpt4GetCandidate);

const gpt3GetCandidate = new GetCandidate("gpt-3.5-turbo-0613");
const gpt3useCase = gpt4GetCandidate.execute.bind(gpt3GetCandidate);

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
    const times = 10;
    const output = await undetermini.run<typeof useCaseInput>({
      times,
      useCaseInput,
      useCases: [
        {
          name: "GetCandidate (gpt-4-0613)",
          execute: gpt4useCase,
          modelName: LLM_MODEL_NAME.GPT_4_0613
        },
        {
          name: "GetCandidate (gpt-3.5-0613)",
          execute: gpt3useCase,
          modelName: LLM_MODEL_NAME.GPT_3_0613
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
