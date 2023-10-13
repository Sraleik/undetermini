import { Undetermini, UseCaseFunction } from "./undetermini";
const undetermini = new Undetermini();

type GetCandidatePayload = { pdfAsText: string };

const getCandidateFactory = (
  latencyRangeInMs: { min: number; max: number },
  accuracyInPercentage: number
) => {
  const getCandidate: UseCaseFunction<GetCandidatePayload> = (
    payload: GetCandidatePayload
  ) => {
    return new Promise((resolve) => {
      const latency =
        Math.random() * (latencyRangeInMs.max - latencyRangeInMs.min) +
        latencyRangeInMs.min;
      const isAccurate = Math.random() < accuracyInPercentage / 100;

      setTimeout(() => {
        resolve(
          isAccurate
            ? {
                firstname: "Nicolas",
                lastname: "Rotier",
                age: 32,
                profession: "Software Engineer"
              }
            : {
                firstname: "Wrong",
                lastname: "Wrong",
                age: 0,
                profession: "Wrong"
              }
        );
      }, latency);
    });
  };
  return getCandidate;
};

const slowAndInaccurate = getCandidateFactory({ min: 100, max: 200 }, 33);
const fastAndAccurate = getCandidateFactory({ min: 10, max: 50 }, 88);

it("should return the latency of use-case", async () => {
  const useCaseInput = {
    pdfAsText: `
			Nicolas Rotier
			32 years old
			Nantes

			Software Engineer  
	`
  };

  const output = await undetermini.run<typeof useCaseInput>({
    times: 50,
    useCaseInput,
    useCases: [
      { name: "GetCandidate (Slow & Inaccurate)", execute: slowAndInaccurate },
      { name: "GetCandidate (Fast & Accurate)", execute: fastAndAccurate }
    ],
    expectedUseCaseOutput: {
      firstname: "Nicolas",
      lastname: "Rotier",
      age: 32,
      profession: "Software Engineer"
    }
  });

  console.table(output);

  expect(output[0].averageLatency <= 600).toBe(true);
  expect(output[0].averageAccuracy <= 80).toBe(true);
}, 60000);
