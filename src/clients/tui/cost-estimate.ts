import type Database from 'better-sqlite3';
import pLimit from 'p-limit';
import type { EvalVariant } from '@eval/engine/variant';
import { computeCost } from '@eval/engine/pricing';
import type { Subject } from '@eval/engine/runner-loop';
import { openEvalDb } from '@eval/engine/storage/schema';
import type { EvalCase } from '@eval/engine/types';
import {
  KeyCaptured,
  keyCaptureMiddleware,
  type CapturedKey,
} from './key-capture-middleware';

/**
 * Read-only cost & cache-hit estimator surfaced in the TUI ConfirmPage before
 * the user proceeds. Read path only — no schema change, no writes.
 *
 * Cache-hit estimation is EXACT: it resolves each planned (variant × case) to
 * the very same `(model_id, prompt_sha, static_hash)` the runtime cache keys
 * on (`trial-cache.ts` LOOKUP_SQL) by building the real call options through
 * `subject.runOne` and short-circuiting at the model boundary
 * (`keyCaptureMiddleware`) — zero network, zero token cost. The estimate then
 * counts historical successful trials by that exact key, so it matches what
 * the run will actually do (no proxy on variant name / config id / slug).
 *
 * Pairs whose key cannot be resolved (build error, or a subject that performs
 * real I/O before the model call) are reported via `unresolvedPairs` and
 * counted as fresh — never silently shown as a wrong-but-precise number.
 */
export type ExactKey = CapturedKey;

export type PlannedRun = {
  modelId: string;
  /** Real runtime cache coordinates. `resolved=false` ⇒ key unknown ⇒ fresh. */
  promptSha: string;
  staticHash: string;
  trialCount: number;
  resolved: boolean;
};

export type RunCostEstimate = {
  totalTrials: number;
  cachedTrials: number;
  freshTrials: number;
  estimatedCostUsd: number;
  modelsLackingData: string[];
  /** Count of (variant×case) pairs whose exact key could not be resolved. */
  unresolvedPairs: number;
};

const pairKey = (variantName: string, caseSlug: string): string =>
  `${variantName}\x00${caseSlug}`;

const tripleKey = (k: {
  modelId: string;
  promptSha: string;
  staticHash: string;
}): string => `${k.modelId}\x00${k.promptSha}\x00${k.staticHash}`;

/**
 * Resolve the exact runtime cache key for every planned (variant × case) by
 * building the real prompt via `subject.runOne` and intercepting at the model
 * boundary. The interceptor throws `KeyCaptured` BEFORE `doGenerate()`, so no
 * provider call is made. Per-pair failures are tolerated (left unresolved).
 */
export const resolvePlannedCacheKeys = async (
  subject: Subject<EvalVariant>,
  variants: ReadonlyArray<EvalVariant>,
  cases: ReadonlyArray<EvalCase>,
): Promise<Map<string, CapturedKey>> => {
  const limit = pLimit(8);
  const out = new Map<string, CapturedKey>();
  await Promise.all(
    variants.flatMap((variant) =>
      cases.map((c) =>
        limit(async () => {
          const sink: { key?: CapturedKey } = {};
          try {
            await subject.runOne({
              input: c.input,
              variant,
              extraMiddlewares: [keyCaptureMiddleware(sink)],
            });
          } catch (err) {
            if (!(err instanceof KeyCaptured)) return; // unresolved → fresh
          }
          if (sink.key) out.set(pairKey(variant.name, c.slug), sink.key);
        }),
      ),
    ),
  );
  return out;
};

/**
 * Build PlannedRun rows from the resolved key map. Pairs missing from the map
 * are emitted with `resolved=false` (treated as fully fresh downstream).
 */
export const buildPlannedRuns = (
  variants: ReadonlyArray<EvalVariant>,
  cases: ReadonlyArray<EvalCase>,
  trialCount: number,
  resolvedKeys: ReadonlyMap<string, CapturedKey>,
): PlannedRun[] =>
  variants.flatMap((variant) =>
    cases.map((c) => {
      const key = resolvedKeys.get(pairKey(variant.name, c.slug));
      return {
        modelId: variant.modelId,
        promptSha: key?.promptSha ?? '',
        staticHash: key?.staticHash ?? '',
        trialCount,
        resolved: key !== undefined,
      };
    }),
  );

/**
 * Average input/output tokens for the SPECIFIC planned run, with a documented
 * fallback chain so the estimate reflects the actual variant rather than a
 * blended model-wide average:
 *
 *   1. `(model_id, static_hash)` — the static_hash identifies the system prompt
 *      / variant, so this is the per-variant token profile (a verbose vs trimmed
 *      prompt have materially different input sizes).
 *   2. fall back to per-`model_id` AVG when that static_hash has no history.
 *   3. fall back to `null` → the model is reported in `modelsLackingData`.
 *
 * `staticHash` is optional: omitting it (or passing `undefined`) skips step 1
 * and queries per-model directly — preserving the original behaviour.
 */
const avgTokensQuery = (
  db: Database.Database,
  modelId: string,
  staticHash?: string,
): { input: number; output: number } | null => {
  const row = (
    staticHash !== undefined
      ? db
          .prepare(
            `SELECT AVG(tokens_input) AS avgInput, AVG(tokens_output) AS avgOutput,
                    COUNT(*) AS n
             FROM trials
             WHERE model_id = ? AND static_hash = ? AND status = 'success'
               AND tokens_input IS NOT NULL AND tokens_output IS NOT NULL`,
          )
          .get(modelId, staticHash)
      : db
          .prepare(
            `SELECT AVG(tokens_input) AS avgInput, AVG(tokens_output) AS avgOutput,
                    COUNT(*) AS n
             FROM trials
             WHERE model_id = ? AND status = 'success'
               AND tokens_input IS NOT NULL AND tokens_output IS NOT NULL`,
          )
          .get(modelId)
  ) as { avgInput: number | null; avgOutput: number | null; n: number };
  if (row.n === 0 || row.avgInput === null || row.avgOutput === null) {
    return null;
  }
  return { input: row.avgInput, output: row.avgOutput };
};

export const estimateAvgTokens = (
  modelId: string,
  db: Database.Database = openEvalDb(),
  staticHash?: string,
): { input: number; output: number } | null => {
  if (staticHash !== undefined && staticHash !== '') {
    const perVariant = avgTokensQuery(db, modelId, staticHash);
    if (perVariant !== null) return perVariant;
  }
  // Fallback: per-model average (step 2). Returns null → modelsLackingData (step 3).
  return avgTokensQuery(db, modelId);
};

/**
 * One GROUP BY query mirroring `trial-cache.ts` LOOKUP_SQL exactly:
 * `(model_id, prompt_sha, static_hash)`, `status='success'`,
 * `output_raw IS NOT NULL`, `trial_index < trialCount`. Only resolved runs are
 * queried (unresolved ones have no key and are fresh by definition).
 *
 * Assumes every PlannedRun shares the same `trialCount` (true by construction
 * — ConfirmPage applies one trialCount uniformly).
 */
const loadCachedTrialCounts = (
  plannedRuns: ReadonlyArray<PlannedRun>,
  db: Database.Database,
): Map<string, number> => {
  const resolved = plannedRuns.filter((p) => p.resolved);
  if (resolved.length === 0) return new Map();
  const trialCount = resolved[0].trialCount;
  const triples = [
    ...new Map(resolved.map((p) => [tripleKey(p), p])).values(),
  ];
  const orClause = triples
    .map(() => '(model_id = ? AND prompt_sha = ? AND static_hash = ?)')
    .join(' OR ');
  const rows = db
    .prepare(
      `SELECT model_id, prompt_sha, static_hash, COUNT(DISTINCT trial_index) AS n
       FROM trials
       WHERE status = 'success'
         AND output_raw IS NOT NULL
         AND trial_index < ?
         AND (${orClause})
       GROUP BY model_id, prompt_sha, static_hash`,
    )
    .all(
      trialCount,
      ...triples.flatMap((t) => [t.modelId, t.promptSha, t.staticHash]),
    ) as Array<{
    model_id: string;
    prompt_sha: string;
    static_hash: string;
    n: number;
  }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      tripleKey({
        modelId: row.model_id,
        promptSha: row.prompt_sha,
        staticHash: row.static_hash,
      }),
      row.n,
    );
  }
  return map;
};

export const estimateCacheHits = (
  plannedRuns: ReadonlyArray<PlannedRun>,
  db: Database.Database = openEvalDb(),
): number => {
  const counts = loadCachedTrialCounts(plannedRuns, db);
  let total = 0;
  for (const planned of plannedRuns) {
    if (!planned.resolved) continue;
    total += counts.get(tripleKey(planned)) ?? 0;
  }
  return total;
};

export const estimateRunCost = (
  plannedRuns: ReadonlyArray<PlannedRun>,
  db: Database.Database = openEvalDb(),
): RunCostEstimate => {
  const cachedCounts = loadCachedTrialCounts(plannedRuns, db);
  let totalTrials = 0;
  let cachedTrials = 0;
  let unresolvedPairs = 0;
  let estimatedCostUsd = 0;
  const modelsLackingDataSet = new Set<string>();

  // Cost is computed PER planned (variant × case) run so we can model OpenAI
  // automatic prefix caching precisely WITHIN a run. The `fresh` trials of one
  // (variant × case) are byte-identical prompts (same input, same system prompt
  // → same static_hash), so OpenAI serves them as genuine 100% prefix-cache
  // hits after the first call. Heuristic:
  //   • the FIRST fresh trial pays full input  → freshFullInput  = fresh>0 ? 1 : 0
  //   • the remaining fresh-1 trials' input is fully cache-read → freshCachedInput = max(0, fresh-1)
  //   • output is ALWAYS billed in full (caching only discounts input).
  // This is EXACT within a case. It deliberately IGNORES cross-case caching of
  // the shared system-prompt prefix (each case here re-pays the first-call input),
  // so the estimate slightly OVER-estimates — the safe / conservative direction.
  // Unresolved pairs are treated as fully fresh at full price (also conservative).
  for (const planned of plannedRuns) {
    totalTrials += planned.trialCount;
    const cached = planned.resolved
      ? (cachedCounts.get(tripleKey(planned)) ?? 0)
      : 0;
    if (!planned.resolved) unresolvedPairs += 1;
    cachedTrials += cached;
    const fresh = planned.trialCount - cached;
    if (fresh === 0) continue;

    // Per-variant avg tokens (static_hash) with model-wide fallback. Unresolved
    // runs have no static_hash → falls back to the per-model average.
    const staticHash = planned.resolved ? planned.staticHash : undefined;
    const avg = estimateAvgTokens(planned.modelId, db, staticHash);
    if (avg === null) {
      modelsLackingDataSet.add(planned.modelId);
      continue;
    }

    const freshFullInput = fresh > 0 ? 1 : 0;
    const freshCachedInput = Math.max(0, fresh - 1);
    // Full-price portion: 1 fresh input + ALL fresh outputs, no cache.
    const full = computeCost(
      planned.modelId,
      avg.input * freshFullInput,
      avg.output * fresh,
      0,
    );
    // Cached portion: the remaining fresh-1 inputs, billed at the cached rate
    // (passed as both inTokens and cachedInputTokens so 100% is discounted).
    const cachedPortion = computeCost(
      planned.modelId,
      avg.input * freshCachedInput,
      0,
      avg.input * freshCachedInput,
    );
    if (full === null || cachedPortion === null) {
      modelsLackingDataSet.add(planned.modelId);
      continue;
    }
    estimatedCostUsd += full + cachedPortion;
  }

  const freshTrials = totalTrials - cachedTrials;

  return {
    totalTrials,
    cachedTrials,
    freshTrials,
    estimatedCostUsd,
    modelsLackingData: [...modelsLackingDataSet],
    unresolvedPairs,
  };
};
