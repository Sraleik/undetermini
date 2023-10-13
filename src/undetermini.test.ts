import { Undetermini, UseCaseFunction } from "./undetermini";
const undetermini = new Undetermini();

type GetCandidatePayload = { pdfAsText: string };
const getCandidate: UseCaseFunction<GetCandidatePayload> = (
  payload: GetCandidatePayload
) => {
  return new Promise((resolve) => {
    const between100to1000ms = Math.random() * (1000 - 100) + 100;
    const isAccurate = Math.random() < 0.75;

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
    }, between100to1000ms);
  });
};

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
    useCase: { name: "GetCandidate (Basic)", execute: getCandidate },
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
