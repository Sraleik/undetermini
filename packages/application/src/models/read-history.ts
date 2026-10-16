import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  modelKey,
  type PricePeriod,
} from '@undetermini/core/models/model';
import type { TriedModel } from '@undetermini/core/models/export-plan';

type FlatPrice = { input: number; output: number; cachedInput: number };

type RunRow = { started_at: string; pricing_table_json: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPeriods = (value: unknown): value is PricePeriod[] =>
  Array.isArray(value) && value.length > 0;

const isFlatPrice = (value: unknown): value is FlatPrice =>
  isRecord(value) &&
  typeof value.input === 'number' &&
  typeof value.output === 'number' &&
  typeof value.cachedInput === 'number';

/** The price a run's snapshot holds for a model, in either format: `{ version: 2,
 *  models }` keyed by provider:id, or the former flat table keyed by id alone
 *  (no provider, no period — dated from the run). */
const priceInSnapshot = ({
  snapshot,
  provider,
  modelId,
  startedAt,
}: {
  snapshot: unknown;
  provider: string;
  modelId: string;
  startedAt: string;
}): PricePeriod[] => {
  if (!isRecord(snapshot)) return [];
  if (snapshot.version === 2 && isRecord(snapshot.models)) {
    const periods = snapshot.models[modelKey({ provider, id: modelId })];
    return isPeriods(periods) ? periods : [];
  }
  const flat = snapshot[modelId];
  if (!isFlatPrice(flat)) return [];
  return [
    {
      from: startedAt.slice(0, 10),
      input: String(flat.input),
      output: String(flat.output),
      cachedInput: String(flat.cachedInput),
    },
  ];
};

const parseSnapshot = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

const hasTables = (db: Database.Database): boolean => {
  const names = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
  return names.includes('trials') && names.includes('runs');
};

/** The models the project's database has tried, with the variant names seen and
 *  the last known price of each. An absent or empty database yields none. */
export const readHistory = (dbPath: string): TriedModel[] => {
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTables(db)) return [];
    const rows = db
      .prepare(
        `SELECT provider, model_id, variant_name FROM trials
         GROUP BY provider, model_id, variant_name
         ORDER BY provider, model_id, variant_name`,
      )
      .all() as { provider: string; model_id: string; variant_name: string }[];
    const runs = (
      db
        .prepare(
          'SELECT started_at, pricing_table_json FROM runs ORDER BY started_at DESC',
        )
        .all() as RunRow[]
    ).map((run) => ({
      startedAt: run.started_at,
      snapshot: parseSnapshot(run.pricing_table_json),
    }));

    const tried = new Map<string, TriedModel>();
    for (const row of rows) {
      const key = modelKey({ provider: row.provider, id: row.model_id });
      const known = tried.get(key);
      if (known !== undefined) {
        known.variantNames.push(row.variant_name);
        continue;
      }
      let lastPrice: PricePeriod[] = [];
      for (const run of runs) {
        lastPrice = priceInSnapshot({
          snapshot: run.snapshot,
          provider: row.provider,
          modelId: row.model_id,
          startedAt: run.startedAt,
        });
        if (lastPrice.length > 0) break;
      }
      tried.set(key, {
        provider: row.provider,
        modelId: row.model_id,
        variantNames: [row.variant_name],
        lastPrice,
      });
    }
    return [...tried.values()];
  } finally {
    db.close();
  }
};
