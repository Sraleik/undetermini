import { Undetermini } from "./undetermini";
const undetermini = new Undetermini();

const getCandidate = (payload: { pdfAsText: string }) => {
  return new Promise((resolve) => {
    const randomTime = Math.random() * (2000 - 500) + 500;
    console.log(
      "🚀 ~ file: undetermini.test.ts:7 ~ returnnewPromise ~ randomTime:",
      randomTime
    );
    setTimeout(() => {
      resolve({
        firstname: "Nicolas",
        lastname: "Rotier",
        age: 32,
        profession: "Software Engineer"
      });
    }, randomTime);
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
    useCaseInput,
    useCase: getCandidate,
    expectedUseCaseOutput: {
      firstname: "Nicolas",
      lastname: "Rotier",
      age: 32,
      profession: "Software Engineer"
    }
  });
  expect(output.latency).toBe(12);
});
