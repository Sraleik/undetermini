export const pct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

export const usd = (n: number, dp = 4): string => `$${n.toFixed(dp)}`;

export const ms = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;

/** Human-readable case input for CLI/TUI (objects are JSON, strings pass through).
 *
 *  An input shaped `{ prompt, … }` shows its `prompt` and appends the remaining
 *  fields as a short suffix. Without this, a gate case that states its
 *  `userLanguage` renders as a raw JSON blob in the run header, which reads as
 *  if the JSON itself were sent to the model — it is not, the runner passes
 *  `prompt` alone (2026-07-27). */
export const formatCaseInputForDisplay = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (
    input !== null &&
    typeof input === 'object' &&
    typeof (input as { prompt?: unknown }).prompt === 'string'
  ) {
    const { prompt, ...rest } = input as { prompt: string } & Record<string, unknown>;
    const suffix = Object.entries(rest)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    return suffix === '' ? prompt : `${prompt}  [${suffix}]`;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
};

/** Persist + log trial failures with message and stack when available. */
export const formatEvalError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};

export const logEvalTrialFailure = (context: {
  variantName: string;
  caseSlug: string;
  trialIndex: number;
  trialId?: string;
  phase: 'llm' | 'runOne';
  error: unknown;
}) => {
  const { variantName, caseSlug, trialIndex, trialId, phase, error } = context;
  const header = `[eval] trial failed phase=${phase} variant=${variantName} case=${caseSlug} trial=${trialIndex}${trialId ? ` id=${trialId}` : ''}`;
  console.error(header);
  console.error(formatEvalError(error));
};
