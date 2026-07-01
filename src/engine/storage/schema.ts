import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export const DEFAULT_DB_PATH = 'eval-results/eval.db';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  git_sha TEXT NOT NULL,
  git_dirty INTEGER NOT NULL,
  dataset_hash TEXT NOT NULL,
  -- system_prompt_text / system_prompt_sha256 dropped in migration 001 :
  -- the prompt now lives in system_prompts (referenced via variant_configs).
  eval_file TEXT NOT NULL,
  cases_dir TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  pricing_table_json TEXT NOT NULL,
  pricing_verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trials (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_sha TEXT NOT NULL,
  static_hash TEXT NOT NULL,
  trial_index INTEGER NOT NULL,
  case_id TEXT NOT NULL,
  case_slug_at_creation TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  created_in_run_id TEXT NOT NULL,
  output_raw TEXT,
  output_hash TEXT,
  finish_reason TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  tokens_cached_input INTEGER,
  estimated_cost_usd REAL,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trials_cache_lookup
  ON trials (model_id, prompt_sha, static_hash, trial_index, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trials_case ON trials (case_id);
CREATE INDEX IF NOT EXISTS idx_trials_run ON trials (created_in_run_id);

CREATE TABLE IF NOT EXISTS assertion_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  assertion_id TEXT NOT NULL,
  assertion_version INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  category TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (trial_id, assertion_id, assertion_version)
);
CREATE INDEX IF NOT EXISTS idx_ar_trial ON assertion_results (trial_id);
CREATE INDEX IF NOT EXISTS idx_ar_assertion ON assertion_results (assertion_id, assertion_version);

CREATE TABLE IF NOT EXISTS trial_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  scorer_name TEXT NOT NULL,
  scorer_version INTEGER NOT NULL,
  assertion_set_fingerprint TEXT NOT NULL,
  score REAL NOT NULL,
  metadata TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (trial_id, scorer_name, scorer_version, assertion_set_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_ts_trial ON trial_scores (trial_id);

-- Content-addressed index of system prompts: id = sha256(text).
-- Lets variant_configs reference a prompt by stable id and dedup across runs.
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);

-- Content-addressed index of variant configurations.
-- id = sha256({provider, model_id, system_prompt_id, provider_options_json}).
-- A config = a combination of axes. Shared across runs reusing the same config.
CREATE TABLE IF NOT EXISTS variant_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  system_prompt_id TEXT NOT NULL REFERENCES system_prompts(id),
  provider_options_json TEXT,
  first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_variant_configs_prompt ON variant_configs (system_prompt_id);
CREATE INDEX IF NOT EXISTS idx_variant_configs_model ON variant_configs (model_id);
`;

/** SQLite has no `ADD COLUMN IF NOT EXISTS`. This helper checks PRAGMA and
 *  ALTERs only if missing — idempotent. Invoked after `db.exec(SCHEMA_SQL)`
 *  so new clones get the column via CREATE TABLE; existing DBs get it
 *  retroactively via ALTER. */
const ensureVariantConfigIdColumn = (db: Database.Database): void => {
  const cols = db
    .prepare("PRAGMA table_info('trials')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === 'variant_config_id')) {
    db.exec(
      `ALTER TABLE trials ADD COLUMN variant_config_id TEXT REFERENCES variant_configs(id);
       CREATE INDEX IF NOT EXISTS idx_trials_variant_config ON trials (variant_config_id);`,
    );
  }
};

/** Idempotent migration for the cached-input token column. SQLite has no
 *  `ADD COLUMN IF NOT EXISTS` — check PRAGMA, ALTER only if absent. Safe no-op
 *  on existing DBs (including the live 96MB eval.db): never drops/recreates the
 *  table, the column defaults to NULL on historical rows. New clones get the
 *  column via CREATE TABLE in SCHEMA_SQL. */
const ensureCachedInputTokensColumn = (db: Database.Database): void => {
  const cols = db
    .prepare("PRAGMA table_info('trials')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === 'tokens_cached_input')) {
    db.exec('ALTER TABLE trials ADD COLUMN tokens_cached_input INTEGER;');
  }
};

let cached: Database.Database | null = null;

// Singleton handle. Cache middleware writes during the run, writeRunToDb writes
// post-runEval — both must share the same connection for WAL ordering and to
// avoid leaking handles. Tests can pass an explicit path; production callers
// use no args.
export const openEvalDb = (path: string = DEFAULT_DB_PATH): Database.Database => {
  if (cached && cached.name === path && cached.open) return cached;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  ensureVariantConfigIdColumn(db);
  ensureCachedInputTokensColumn(db);
  cached = db;
  return db;
};

export const closeEvalDb = (): void => {
  if (cached?.open) cached.close();
  cached = null;
};
