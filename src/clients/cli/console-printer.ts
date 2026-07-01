import { CATEGORY_DESCRIPTIONS_FR } from '@eval/engine/categories';
import type { EventSubscribable } from '../../shared/types';
import { ms, pct1, usd } from '../../shared/format';
import type { ColKey, SectionName, SortSpec } from './cli-args';
import type { RunResult, VariantResult } from '@eval/engine/runner-loop';

type Col = {
  key: ColKey;
  header: string;
  render: (v: VariantResult) => string;
  align?: 'left' | 'right';
};

const unitCost = (v: VariantResult, trialCount: number): number => {
  const trials = v.cases.length * trialCount;
  return trials > 0 ? v.aggregate.totalCostUsd / trials : 0;
};

/** Extract the numeric value used for sorting on a given column. */
const sortValue = (
  v: VariantResult,
  key: ColKey,
  trialCount: number,
): number => {
  switch (key) {
    case 'score':
      return v.aggregate.avgScore;
    case 'pass':
      return v.aggregate.passRate;
    case 'cost':
      return v.aggregate.totalCostUsd;
    case 'unit-cost':
      return unitCost(v, trialCount);
    case 'latency':
      return v.aggregate.avgRealLatencyMs;
    case 'fresh':
      return v.aggregate.freshCalls;
    case 'cached':
      return v.aggregate.cacheHits;
    case 'errors':
      return v.aggregate.errorCalls;
  }
};

export const sortVariants = (
  variants: VariantResult[],
  specs: SortSpec[],
  trialCount: number,
): VariantResult[] => {
  // Walk the spec list — first non-equal comparison wins, equals fall through
  // to the next tiebreaker. If every spec is equal, Array.sort stability
  // preserves the original variant order.
  return [...variants].sort((a, b) => {
    for (const spec of specs) {
      const va = sortValue(a, spec.key, trialCount);
      const vb = sortValue(b, spec.key, trialCount);
      if (va !== vb) {
        const dir = spec.direction === 'asc' ? 1 : -1;
        return dir * (va - vb);
      }
    }
    return 0;
  });
};

const visibleLength = (s: string): number => {
  // No ANSI in our output today; if added later, strip codes here.
  return s.length;
};

const pad = (s: string, w: number, align: 'left' | 'right' = 'left'): string => {
  const len = visibleLength(s);
  if (len >= w) return s;
  const fill = ' '.repeat(w - len);
  return align === 'left' ? s + fill : fill + s;
};

// The "Variant" row label is implicit — always shown, not a metric, not in --cols filter.
type VariantLabelCol = Omit<Col, 'key'>;
const VARIANT_COL: VariantLabelCol = {
  header: 'Variant',
  render: (v) => v.name,
  align: 'left',
};

const buildMetricCols = (trialCount: number): Col[] => [
  { key: 'score',     header: 'Score',   render: (v) => pct1(v.aggregate.avgScore),            align: 'right' },
  { key: 'pass',      header: 'Pass%',   render: (v) => pct1(v.aggregate.passRate),            align: 'right' },
  { key: 'cost',      header: 'Total $', render: (v) => usd(v.aggregate.totalCostUsd),         align: 'right' },
  { key: 'unit-cost', header: '$/trial', render: (v) => usd(unitCost(v, trialCount), 5),       align: 'right' },
  { key: 'latency',   header: 'Latency', render: (v) => ms(v.aggregate.avgRealLatencyMs),      align: 'right' },
  { key: 'fresh',     header: 'Fresh',   render: (v) => String(v.aggregate.freshCalls),        align: 'right' },
  { key: 'cached',    header: 'Cached',  render: (v) => String(v.aggregate.cacheHits),         align: 'right' },
  { key: 'errors',    header: 'Errors',  render: (v) => String(v.aggregate.errorCalls),        align: 'right' },
];

/**
 * Order the metric columns for display:
 *   1. Sort keys first, in the order the user supplied (--sort=A,B,C → A,B,C).
 *      A sort key is force-included even if absent from --cols (sorting by an
 *      invisible column is confusing).
 *   2. Remaining visible columns, in user's --cols order if specified,
 *      else in the default order from buildMetricCols.
 *
 * If no --cols and no --sort: returns all metric columns in default order.
 */
export const orderMetricCols = <C extends { key: ColKey }>(
  all: C[],
  filter: Set<ColKey> | null,
  sort: SortSpec[] | null,
): C[] => {
  const byKey = new Map<ColKey, C>(all.map((c) => [c.key, c] as const));
  const out: C[] = [];
  const used = new Set<ColKey>();
  for (const spec of sort ?? []) {
    if (used.has(spec.key)) continue;
    const col = byKey.get(spec.key);
    if (col === undefined) continue;
    out.push(col);
    used.add(spec.key);
  }
  const remaining: Iterable<ColKey> = filter ?? all.map((c) => c.key);
  for (const key of remaining) {
    if (used.has(key)) continue;
    const col = byKey.get(key);
    if (col === undefined) continue;
    out.push(col);
    used.add(key);
  }
  return out;
};

const buildTableLines = (
  variants: VariantResult[],
  metricCols: Col[],
): string[] => {
  const cols: VariantLabelCol[] = [VARIANT_COL, ...metricCols];

  const widths = cols.map((col) => {
    const headerW = visibleLength(col.header);
    const maxRow = variants.reduce(
      (m, v) => Math.max(m, visibleLength(col.render(v))),
      0,
    );
    return Math.max(headerW, maxRow);
  });

  const top = `┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`;
  const sep = `├${widths.map((w) => '─'.repeat(w + 2)).join('┼')}┤`;
  const bot = `└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`;
  const renderRow = (cells: string[]): string =>
    `│ ${cells.map((c, i) => pad(c, widths[i]!, cols[i]!.align ?? 'left')).join(' │ ')} │`;

  const out: string[] = [];
  out.push(top);
  out.push(renderRow(cols.map((c) => c.header)));
  out.push(sep);
  for (const v of variants) {
    out.push(renderRow(cols.map((c) => c.render(v))));
  }
  out.push(bot);
  return out;
};

/** Per-assertion pass/total across the entire run (all variants × all cases ×
 *  all successful trials). Errored trials contribute nothing — they carry an
 *  empty `allAssertions`. Used by the legend block to surface sub-scorer
 *  pass-rate without forcing the user into `--sections=assertions`. */
const collectAssertionStats = (
  run: RunResult,
): Map<string, Map<string, { passed: number; total: number }>> => {
  const out = new Map<string, Map<string, { passed: number; total: number }>>();
  for (const variant of run.variants) {
    for (const c of variant.cases) {
      for (const t of c.trials) {
        for (const a of t.score.metadata.allAssertions) {
          if (!out.has(a.category)) out.set(a.category, new Map());
          const inner = out.get(a.category)!;
          const cur = inner.get(a.name) ?? { passed: 0, total: 0 };
          cur.total += 1;
          if (a.passed) cur.passed += 1;
          inner.set(a.name, cur);
        }
      }
    }
  }
  return out;
};

/** Collect the (category → unique assertion names) map across the whole run.
 *  Used by the legend block under the per-category table. */
const collectAssertionsByCategory = (
  run: RunResult,
): Map<string, string[]> => {
  const out = new Map<string, Set<string>>();
  for (const variant of run.variants) {
    for (const c of variant.cases) {
      // Prefer a successful trial — failed trials have empty allAssertions.
      const trial = c.trials.find((t) => t.status === 'success') ?? c.trials[0];
      if (!trial) continue;
      for (const a of trial.score.metadata.allAssertions) {
        if (!out.has(a.category)) out.set(a.category, new Set());
        out.get(a.category)!.add(a.name);
      }
    }
  }
  // Convert Sets → ordered arrays. Order = insertion (= source order in case files).
  const result = new Map<string, string[]>();
  for (const [cat, names] of out) result.set(cat, [...names]);
  return result;
};

const buildCategoryBlock = (
  variants: VariantResult[],
  run: RunResult,
): string[] => {
  // Variant-by-category bordered table. Rows that are uniformly 100% are
  // dimmed to `–` so the eye lands on the non-trivial rows.
  const allCategories = new Set<string>();
  const ratios = new Map<string, Record<string, number>>();
  for (const v of variants) {
    const accum: Record<string, { sum: number; count: number }> = {};
    for (const c of v.cases) {
      for (const [cat, r] of Object.entries(c.aggregate.byCategory)) {
        accum[cat] ??= { sum: 0, count: 0 };
        accum[cat].sum += r;
        accum[cat].count += 1;
        allCategories.add(cat);
      }
    }
    const r: Record<string, number> = {};
    for (const [cat, { sum, count }] of Object.entries(accum)) {
      r[cat] = sum / count;
    }
    ratios.set(v.name, r);
  }
  if (allCategories.size === 0) return [];

  const cats = Array.from(allCategories).sort();
  const headers = ['Variant', ...cats];
  const dimRow = (vName: string): boolean =>
    cats.every((cat) => (ratios.get(vName)?.[cat] ?? 1) === 1);

  const rows: string[][] = variants.map((v) => {
    const dim = dimRow(v.name);
    const cells = cats.map((cat) => {
      if (dim) return '–';
      const r = ratios.get(v.name)?.[cat];
      return r === undefined ? '–' : pct1(r);
    });
    return [v.name, ...cells];
  });

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]!.length)),
  );
  const top = `┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐`;
  const sep = `├${widths.map((w) => '─'.repeat(w + 2)).join('┼')}┤`;
  const bot = `└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘`;
  const align = (i: number): 'left' | 'right' => (i === 0 ? 'left' : 'right');
  const renderRow = (cells: string[]): string =>
    `│ ${cells.map((c, i) => pad(c, widths[i]!, align(i))).join(' │ ')} │`;

  const out: string[] = [];
  out.push(top);
  out.push(renderRow(headers));
  out.push(sep);
  for (const row of rows) out.push(renderRow(row));
  out.push(bot);

  // Legend: one block per category — header line + bulleted assertion names
  // with per-assertion pass-rate (averaged across all variants × all trials).
  // Category names are left-padded so the `—` separators align; assertion
  // names share a global width so the `%` column aligns across categories.
  const assertionsByCat = collectAssertionsByCategory(run);
  const assertionStats = collectAssertionStats(run);
  const catLabelW = Math.max(...cats.map((c) => c.length));
  const allNames = [...assertionsByCat.values()].flat();
  const nameW = allNames.length > 0 ? Math.max(...allNames.map((n) => n.length)) : 0;
  out.push('');
  cats.forEach((cat, i) => {
    if (i > 0) out.push('');
    const desc = CATEGORY_DESCRIPTIONS_FR[cat];
    const header = desc
      ? `${pad(cat, catLabelW)} — ${desc}`
      : pad(cat, catLabelW);
    out.push(header);
    for (const name of assertionsByCat.get(cat) ?? []) {
      const s = assertionStats.get(cat)?.get(name);
      const rate =
        s && s.total > 0 ? pct1(s.passed / s.total).padStart(6) : '     –';
      out.push(`  · ${pad(name, nameW)}  ${rate}`);
    }
  });

  return out;
};

/** Visible width of a line (max over wrapped width since we never wrap). */
const blockWidth = (lines: string[]): number =>
  lines.reduce((m, l) => Math.max(m, visibleLength(l)), 0);

/** Stack two blocks horizontally. Shorter block is bottom-padded with blank
 *  lines so both render flush at the top. `gap` spaces between them. */
const joinSideBySide = (
  left: string[],
  right: string[],
  gap: number,
): string[] => {
  const leftW = blockWidth(left);
  const height = Math.max(left.length, right.length);
  const gapStr = ' '.repeat(gap);
  const out: string[] = [];
  for (let i = 0; i < height; i += 1) {
    const l = pad(left[i] ?? '', leftW, 'left');
    const r = right[i] ?? '';
    out.push(`${l}${gapStr}${r}`);
  }
  return out;
};

const renderFailedAssertions = (variants: VariantResult[]): void => {
  // Per (variant, case) drill-down: which assertions failed and how often.
  type Block = {
    variant: string;
    caseSlug: string;
    trials: number;
    rows: { name: string; category: string; failed: number }[];
  };
  const blocks: Block[] = [];
  for (const v of variants) {
    for (const c of v.cases) {
      const total = c.trials.length;
      if (total === 0) continue;
      const failedCount = new Map<string, { category: string; count: number }>();
      for (const t of c.trials) {
        for (const a of t.score.metadata.failed) {
          const cur = failedCount.get(a.name) ?? { category: a.category, count: 0 };
          cur.count += 1;
          failedCount.set(a.name, cur);
        }
      }
      if (failedCount.size === 0) continue;
      const rows = Array.from(failedCount.entries())
        .map(([name, { category, count }]) => ({ name, category, failed: count }))
        .sort((a, b) => b.failed - a.failed);
      blocks.push({ variant: v.name, caseSlug: c.caseSlug, trials: total, rows });
    }
  }
  if (blocks.length === 0) return;

  // Global widths across ALL blocks so columns align variant-to-variant
  // (previously each block had its own widths → ragged display).
  const allRows = blocks.flatMap((b) => b.rows);
  const catW = Math.max(...allRows.map((r) => r.category.length));
  const nameW = Math.max(...allRows.map((r) => r.name.length));
  const ratioW = Math.max(
    ...blocks.flatMap((b) => b.rows.map((r) => `${r.failed}/${b.trials}`.length)),
  );

  console.log();
  console.log('Assertions échouées (par variant × case) :');
  blocks.forEach((b, i) => {
    if (i > 0) console.log();
    console.log(`  ${b.variant} · ${b.caseSlug} (${b.trials} trials)`);
    for (const r of b.rows) {
      const pctStr = pct1(r.failed / b.trials).padStart(6);
      const ratio = `${r.failed}/${b.trials}`.padStart(ratioW);
      console.log(
        `    ${pad(r.category, catW)}  ${pad(r.name, nameW)}  ${ratio}  (${pctStr})`,
      );
    }
  });
};

const renderFailures = (run: RunResult): void => {
  const lines: string[] = [];
  for (const variant of run.variants) {
    for (const c of variant.cases) {
      const failed = c.trials.filter((t) => t.status === 'fail');
      if (failed.length === 0) continue;
      const errSamples = new Set(failed.map((t) => t.error ?? 'unknown error'));
      const sampleList = Array.from(errSamples).slice(0, 2).join(' | ');
      lines.push(
        `  ${variant.name} / ${c.caseSlug} : ${failed.length} fail(s) — ${sampleList}`,
      );
    }
  }
  if (lines.length > 0) {
    console.log();
    console.log('Erreurs (trials qui ont planté) :');
    for (const l of lines) console.log(l);
  }
};

const renderCasesHeader = (run: RunResult): void => {
  const cases = run.variants[0]?.cases ?? [];
  if (cases.length === 0) return;
  console.log('Cases:');
  cases.forEach((c, i) => {
    const idx = `[${i + 1}]`;
    const slug = c.caseSlug;
    const input = String(c.input).replace(/\s+/g, ' ').trim();
    console.log(`  ${idx} ${slug}`);
    console.log(`      "${input}"`);
  });
};

export const printConsoleSummary = (
  subjectName: string,
  run: RunResult,
  meta: { trialCount: number; cases: number; variants: number },
  display: {
    sections: Set<SectionName>;
    cols?: Set<ColKey> | null;
    sort?: SortSpec[] | null;
  } = { sections: new Set() },
): void => {
  // Sort variants once — propagates to main table, categories, and assertions
  // so the ordering stays consistent across all sections.
  const variants =
    display.sort && display.sort.length > 0
      ? sortVariants(run.variants, display.sort, meta.trialCount)
      : run.variants;

  console.log();
  console.log(
    `${subjectName} — ${meta.cases} case(s) × ${meta.trialCount} trial(s) × ${meta.variants} variant(s)`,
  );
  console.log();
  renderCasesHeader(run);
  console.log();
  const orderedMetricCols = orderMetricCols(
    buildMetricCols(meta.trialCount),
    display.cols ?? null,
    display.sort ?? null,
  );
  const mainLines = buildTableLines(variants, orderedMetricCols);
  const categoryLines = display.sections.has('categories')
    ? buildCategoryBlock(variants, { ...run, variants })
    : [];

  // Side-by-side only if the terminal can fit both blocks + gap. Otherwise
  // fall back to vertical stacking (legacy layout).
  const SIDE_GAP = 4;
  // process.stdout.columns is undefined when stdout isn't a TTY (e.g. piped).
  // Honor the COLUMNS env var as fallback so CI / pipe usage still gets the
  // side-by-side layout if the user signals a width explicitly.
  const termWidth =
    Number(process.env.COLUMNS) || process.stdout.columns || 0;
  const fitsSideBySide =
    categoryLines.length > 0 &&
    termWidth >= blockWidth(mainLines) + SIDE_GAP + blockWidth(categoryLines);

  const CATEGORY_TITLE = "Pass% par catégorie d'assertion (moyenne sur les cases) :";
  if (fitsSideBySide) {
    // Title sits over the right block only — left-padded so it lines up with
    // where the categories table starts horizontally. Keeps the two table
    // top-borders aligned on the same row.
    const titleIndent = ' '.repeat(blockWidth(mainLines) + SIDE_GAP);
    console.log(`${titleIndent}${CATEGORY_TITLE}`);
    for (const line of joinSideBySide(mainLines, categoryLines, SIDE_GAP)) {
      console.log(line);
    }
  } else {
    for (const line of mainLines) console.log(line);
    if (categoryLines.length > 0) {
      console.log();
      console.log(CATEGORY_TITLE);
      for (const line of categoryLines) console.log(line);
    }
  }
  if (display.sections.has('assertions')) renderFailedAssertions(variants);
  renderFailures({ ...run, variants });

  const totals = run.variants.reduce(
    (acc, v) => ({
      trials: acc.trials + v.cases.reduce((a, c) => a + c.trials.length, 0),
      fresh: acc.fresh + v.aggregate.freshCalls,
      cache: acc.cache + v.aggregate.cacheHits,
      errors: acc.errors + v.aggregate.errorCalls,
      cost: acc.cost + v.aggregate.totalCostUsd,
    }),
    { trials: 0, fresh: 0, cache: 0, errors: 0, cost: 0 },
  );
  console.log();
  console.log(
    `Total : ${totals.trials} trials (${totals.fresh} fresh / ${totals.cache} cached / ${totals.errors} errors), ${usd(totals.cost)}, wall ${ms(run.durationMs)}`,
  );
};

/**
 * Subscribe the console printer to an EvalEngine's event stream.
 *
 * Phase 0 behavior: batches on `runCompleted` — full summary printed once
 * when the run finishes (matches today's `printConsoleSummary` timing).
 * Per-trial incremental printing is Phase 1 (driven by Ink's reactive needs).
 *
 * Returns the unsubscribe function from `engine.on()`.
 */
export const subscribeConsolePrinter = (args: {
  engine: EventSubscribable;
  subjectName: string;
  meta: { trialCount: number; cases: number; variants: number };
  display: {
    sections: Set<SectionName>;
    cols?: Set<ColKey> | null;
    sort?: SortSpec[] | null;
  };
}): (() => void) => {
  return args.engine.on((event) => {
    if (event.kind === 'runCompleted') {
      printConsoleSummary(args.subjectName, event.result, args.meta, args.display);
    }
  });
};
