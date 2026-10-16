import type { ModelKey } from './model';

export type TrialStatus = 'success' | 'fail' | 'unavailable';

type CostedTrial = {
  model: ModelKey;
  status: TrialStatus;
  /** Whole nano-dollars, `null` when the model has no price. */
  costNanoUsd: number | null;
};

/** An unpriced trial never counts as zero: its model is named, the total is partial. */
export const sumCosts = (
  trials: CostedTrial[],
): { nanoUsd: number; unpricedModels: ModelKey[] } => {
  let nanoUsd = 0;
  const unpricedModels = new Set<ModelKey>();
  for (const { model, status, costNanoUsd } of trials) {
    if (status === 'unavailable') continue;
    if (costNanoUsd === null) {
      unpricedModels.add(model);
      continue;
    }
    nanoUsd += costNanoUsd;
    if (!Number.isSafeInteger(nanoUsd)) {
      throw new RangeError(
        `Total inexact : ${nanoUsd} dépasse la plage des entiers sûrs`,
      );
    }
  }
  return { nanoUsd, unpricedModels: [...unpricedModels] };
};

/** Share of successes among the trials that actually ran, or `null` when none did. */
export const successRate = (statuses: TrialStatus[]): number | null => {
  const ran = statuses.filter((status) => status !== 'unavailable');
  if (ran.length === 0) return null;
  return ran.filter((status) => status === 'success').length / ran.length;
};

/** The only place a float appears: display. */
export const formatUsd = (nanoUsd: number, decimals = 4): string =>
  `$${(nanoUsd / 1e9).toFixed(decimals)}`;
