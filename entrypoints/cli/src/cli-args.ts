import { parseArgs } from 'node:util';
import type { CacheMode } from '@undetermini/application/cache/index';
import type { Catalog } from '@undetermini/core/models/catalog';
import type { ModelAxisInputs } from '@undetermini/core/models/expand';
import { modelKey } from '@undetermini/core/models/model';

export type SectionName = 'categories' | 'assertions';

export type ColKey =
  | 'score'
  | 'pass'
  | 'cost'
  | 'unit-cost'
  | 'latency'
  | 'fresh'
  | 'cached'
  | 'errors';

export type SortDirection = 'asc' | 'desc';
export type SortSpec = { key: ColKey; direction: SortDirection };

/** Cartesian-mode payload. Present iff `--models` was passed (any other axis flag
 *  without `--models` triggers a validation error in `parseEvalArgs`). The runner
 *  expands `entries` into variants via `expandModels`, replacing the subject's
 *  static variants for this run. */
export type CartesianMode = {
  /** Chosen models, each with the setting names it receives (`'default'` = none). */
  entries: ModelAxisInputs<unknown>['models'][number][];
  /** Raw `--sys-prompts` tokens — resolved to file contents by the runner via
   *  `resolveSysPrompts`. Kept as strings here so this module stays I/O-free. */
  sysPromptTokens: string[];
  /** Raw `--schemas` tokens — validated against `REGISTERED_SCHEMAS` by the
   *  runner. Kept as strings here so this module stays registry-free. */
  schemaTokens: string[];
};

export type EvalCliArgs = {
  /** Which registered subject to run. Null = use the registry default (nl-to-filter-rank).
   *  Resolved to a concrete subject by `resolveSubject` in the runner. */
  subject: string | null;
  trialCount: number;
  maxConcurrency: number;
  cacheMode: CacheMode;
  caseSlugs: string[] | null;
  sections: Set<SectionName>;
  cols: Set<ColKey> | null;
  /** Ordered list of sort keys — primary first, then tiebreakers. */
  sort: SortSpec[] | null;
  /** Null when no axis flag passed (legacy flow: use `subject.variants` as-is). */
  cartesian: CartesianMode | null;
};

export const KNOWN_COL_KEYS: ReadonlyArray<ColKey> = [
  'score',
  'pass',
  'cost',
  'unit-cost',
  'latency',
  'fresh',
  'cached',
  'errors',
];

export const KNOWN_SECTION_NAMES: ReadonlyArray<SectionName> = [
  'categories',
  'assertions',
];

const KNOWN_COLS = new Set<ColKey>(KNOWN_COL_KEYS);
const KNOWN_SECTIONS = new Set<SectionName>(KNOWN_SECTION_NAMES);

// Columns where "higher is better" — used as the smart default sort direction.
// Exported so the TUI can reuse it when prompting for sort direction.
export const HIGHER_IS_BETTER = new Set<ColKey>([
  'score',
  'pass',
  'fresh',
  'cached',
]);

const parseCols = (raw: string | undefined): Set<ColKey> | null => {
  if (raw === undefined) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  const out = new Set<ColKey>();
  for (const item of items) {
    if (!KNOWN_COLS.has(item as ColKey)) {
      throw new Error(
        `--cols=${raw} contains unknown column '${item}'. Known: ${[...KNOWN_COLS].join(', ')}.`,
      );
    }
    out.add(item as ColKey);
  }
  return out;
};

const parseSortItem = (item: string, raw: string): SortSpec => {
  const [keyRaw, dirRaw] = item.split(':').map((s) => s.trim());
  if (!keyRaw || !KNOWN_COLS.has(keyRaw as ColKey)) {
    throw new Error(
      `--sort=${raw} unknown column '${keyRaw}'. Known: ${[...KNOWN_COLS].join(', ')}.`,
    );
  }
  const key = keyRaw as ColKey;
  if (dirRaw === undefined) {
    return { key, direction: HIGHER_IS_BETTER.has(key) ? 'desc' : 'asc' };
  }
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    throw new Error(
      `--sort=${raw} invalid direction '${dirRaw}' (expected 'asc' or 'desc').`,
    );
  }
  return { key, direction: dirRaw };
};

const parseSort = (raw: string | undefined): SortSpec[] | null => {
  if (raw === undefined || raw === '') return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  const specs = items.map((item) => parseSortItem(item, raw));
  // Reject duplicate keys — a second occurrence is dead weight and almost
  // certainly a typo (e.g. --sort=score,score:asc).
  const seen = new Set<ColKey>();
  for (const s of specs) {
    if (seen.has(s.key)) {
      throw new Error(
        `--sort=${raw} contains duplicate key '${s.key}' — each column can appear at most once.`,
      );
    }
    seen.add(s.key);
  }
  return specs;
};

const parseSections = (raw: string | undefined): Set<SectionName> => {
  if (raw === undefined) return new Set();
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return new Set();
  if (items.includes('all')) return new Set(KNOWN_SECTIONS);
  const out = new Set<SectionName>();
  for (const item of items) {
    if (!KNOWN_SECTIONS.has(item as SectionName)) {
      throw new Error(
        `--sections=${raw} contains unknown section '${item}'. Known: ${[...KNOWN_SECTIONS, 'all'].join(', ')}.`,
      );
    }
    out.add(item as SectionName);
  }
  return out;
};

const parsePositiveInt = (
  raw: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `--${name}=${raw} invalid (expected positive integer, got ${typeof n === 'number' && !Number.isFinite(n) ? 'NaN' : raw}).`,
    );
  }
  return n;
};

const parseCacheMode = (raw: string | undefined): CacheMode => {
  if (raw === undefined || raw === '') return 'auto';
  if (raw === 'auto' || raw === 'write-only') return raw;
  if (raw === 'refresh') {
    throw new Error(
      `--cache-mode=refresh was removed (v3.2). Use 'write-only' to append a fresh trial without overwriting history, or 'auto' (default) for lookup+write.`,
    );
  }
  throw new Error(
    `--cache-mode=${raw} invalid (expected 'auto' | 'write-only').`,
  );
};

const parseCommaList = (raw: string | undefined): string[] | null => {
  if (raw === undefined) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length === 0 ? null : items;
};

const SETTINGS_FLAG_HINT =
  'Utilise --settings=<nom,…> : les noms de réglages déclarés par chaque modèle dans la config.';

const REMOVED_FLAGS = ['reasoning-efforts', 'thinking-budgets'] as const;

const resolveModels = (raw: string | undefined, catalog: Catalog) => {
  const items = parseCommaList(raw);
  if (items === null) return null;
  return items.map((ref) => {
    const resolved = catalog.resolveRef(ref);
    if (resolved.ok) return resolved.model;
    const declared = catalog.models.map(modelKey).join(', ');
    throw new Error(
      `--models=${raw} : ${resolved.error} Modèles déclarés dans la clé models de undetermini.config.ts : ${declared === '' ? '(aucun)' : declared}. Pour un essai ponctuel : openrouter:<id> (ex. openrouter:deepseek/deepseek-chat).`,
    );
  });
};

const buildCartesianMode = (
  models: ReturnType<typeof resolveModels>,
  settings: string[] | null,
  sysPromptTokens: string[] | null,
  schemaTokens: string[] | null,
): CartesianMode | null => {
  const hasAnyAxisFlag =
    models !== null ||
    settings !== null ||
    sysPromptTokens !== null ||
    schemaTokens !== null;
  if (!hasAnyAxisFlag) return null;
  if (models === null) {
    throw new Error(
      '--settings, --sys-prompts, --schemas require --models. Pass --models=... to activate cartesian mode (or use `npm run eval:tui` to pick models interactively).',
    );
  }
  const requested = settings ?? ['default'];
  const declaredByAny = new Set(
    models.flatMap((model) => Object.keys(model.settings ?? {})),
  );
  for (const name of requested) {
    if (name !== 'default' && !declaredByAny.has(name)) {
      throw new Error(
        `--settings : aucun modèle choisi ne déclare le réglage '${name}'. Déclarés par les modèles choisis : ${[...declaredByAny].join(', ') || '(aucun)'}.`,
      );
    }
  }
  const entries = models.map((model) => ({
    model,
    settingNames: requested.filter(
      (name) => name === 'default' || name in (model.settings ?? {}),
    ),
  }));
  return {
    entries,
    sysPromptTokens: sysPromptTokens ?? ['default'],
    schemaTokens: schemaTokens ?? ['default'],
  };
};

export const parseEvalArgs = (
  argv: string[] = process.argv.slice(2),
  catalog: Catalog,
): EvalCliArgs => {
  const { values } = parseArgs({
    args: argv,
    options: {
      subject: { type: 'string' },
      'trial-count': { type: 'string' },
      'max-concurrency': { type: 'string' },
      'cache-mode': { type: 'string' },
      'case-slugs': { type: 'string' },
      sections: { type: 'string' },
      cols: { type: 'string' },
      sort: { type: 'string' },
      models: { type: 'string' },
      settings: { type: 'string' },
      'reasoning-efforts': { type: 'string' },
      'thinking-budgets': { type: 'string' },
      'sys-prompts': { type: 'string' },
      schemas: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  for (const flag of REMOVED_FLAGS) {
    if (values[flag] !== undefined) {
      throw new Error(`--${flag} a été retiré. ${SETTINGS_FLAG_HINT}`);
    }
  }
  return {
    subject: values['subject'] ?? null,
    trialCount: parsePositiveInt(values['trial-count'], 30, 'trial-count'),
    maxConcurrency: parsePositiveInt(
      values['max-concurrency'],
      5,
      'max-concurrency',
    ),
    cacheMode: parseCacheMode(values['cache-mode']),
    caseSlugs: parseCommaList(values['case-slugs']),
    sections: parseSections(values['sections']),
    cols: parseCols(values['cols']),
    sort: parseSort(values['sort']),
    cartesian: buildCartesianMode(
      resolveModels(values['models'], catalog),
      parseCommaList(values['settings']),
      parseCommaList(values['sys-prompts']),
      parseCommaList(values['schemas']),
    ),
  };
};
