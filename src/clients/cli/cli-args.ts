import { parseArgs } from 'node:util';
import type { CacheMode } from '@eval/engine/cache';
import type {
  AxisModelEntry,
  ReasoningEffortValue,
} from '@eval/engine/axes/axis-inputs';
import { getProvider, knownModelIds } from '@eval/engine/axes/model-capabilities';

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
 *  expands this into `EvalVariant[]` via `expandCartesian`, replacing the subject's
 *  static variants for this run. */
export type CartesianMode = {
  models: AxisModelEntry[];
  reasoningEfforts: ReadonlyArray<ReasoningEffortValue | 'default'>;
  thinkingBudgets: ReadonlyArray<number | 'default'>;
  /** Raw `--sys-prompts` tokens — resolved to file contents by the runner via
   *  `resolveSysPrompts`. Kept as strings here so this module stays I/O-free. */
  sysPromptTokens: string[];
};

export type EvalCliArgs = {
  /** Which registered subject to run. Null = use the registry default
   *  (`example`). Resolved to a concrete subject by `resolveSubject`. */
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

const REASONING_EFFORT_VALUES: ReadonlyArray<ReasoningEffortValue> = [
  'minimal',
  'low',
  'medium',
  'high',
];

const parseModels = (raw: string | undefined): AxisModelEntry[] | null => {
  if (raw === undefined) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return items.map((modelId) => {
    const provider = getProvider(modelId);
    if (provider === undefined) {
      throw new Error(
        `--models=${raw} contains unknown model '${modelId}'. Known: ${knownModelIds().join(', ')}. Add new models to MODEL_CAPABILITIES in eval/axes/model-capabilities.ts.`,
      );
    }
    return { provider, modelId };
  });
};

const parseReasoningEfforts = (
  raw: string | undefined,
): Array<ReasoningEffortValue | 'default'> | null => {
  if (raw === undefined) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return items.map((item) => {
    if (item === 'default') return 'default';
    if (REASONING_EFFORT_VALUES.includes(item as ReasoningEffortValue)) {
      return item as ReasoningEffortValue;
    }
    throw new Error(
      `--reasoning-efforts=${raw} contains invalid value '${item}'. Known: default, ${REASONING_EFFORT_VALUES.join(', ')}.`,
    );
  });
};

const parseThinkingBudgets = (
  raw: string | undefined,
): Array<number | 'default'> | null => {
  if (raw === undefined) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return items.map((item) => {
    if (item === 'default') return 'default';
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(
        `--thinking-budgets=${raw} contains invalid value '${item}' (expected 'default' or positive integer).`,
      );
    }
    return n;
  });
};

const buildCartesianMode = (
  models: AxisModelEntry[] | null,
  reasoningEfforts: Array<ReasoningEffortValue | 'default'> | null,
  thinkingBudgets: Array<number | 'default'> | null,
  sysPromptTokens: string[] | null,
): CartesianMode | null => {
  const hasAnyAxisFlag =
    models !== null ||
    reasoningEfforts !== null ||
    thinkingBudgets !== null ||
    sysPromptTokens !== null;
  if (!hasAnyAxisFlag) return null;
  if (models === null) {
    throw new Error(
      '--reasoning-efforts, --thinking-budgets, --sys-prompts require --models. Pass --models=... to activate cartesian mode (or use `npm run eval:tui` to pick models interactively).',
    );
  }
  return {
    models,
    reasoningEfforts: reasoningEfforts ?? ['default'],
    thinkingBudgets: thinkingBudgets ?? ['default'],
    sysPromptTokens: sysPromptTokens ?? ['default'],
  };
};

export const parseEvalArgs = (
  argv: string[] = process.argv.slice(2),
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
      'reasoning-efforts': { type: 'string' },
      'thinking-budgets': { type: 'string' },
      'sys-prompts': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
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
      parseModels(values['models']),
      parseReasoningEfforts(values['reasoning-efforts']),
      parseThinkingBudgets(values['thinking-budgets']),
      parseCommaList(values['sys-prompts']),
    ),
  };
};
