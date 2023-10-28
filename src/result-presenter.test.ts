import { ResultPresenter } from "./result-presenter";
it("should display a sexy table", () => {
  const resultPresenter = new ResultPresenter();

  resultPresenter.displayResults([
    {
      name: "Get Candidate, Accurate",
      averageCost: 0.001,
      averageLatency: 500,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, Accurate & Fast",
      averageCost: 0.001,
      averageLatency: 250,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, GPT-4",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 50
    },
    {
      name: "Get Candidate, Accurate & Fast & Cheap",
      averageCost: 0.00001,
      averageLatency: 250,
      averageAccuracy: 100
    },
    {
      name: "Get Candidate, Coherere",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 33
    },
    {
      name: "Get Candidate, GPT3.5 fine tune (dataset 332)",
      averageCost: 0.02,
      averageLatency: 50,
      averageAccuracy: 95
    }
  ]);
});
