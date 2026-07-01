import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { EventSubscribable } from '../../shared/types';
import type {
  RunOpts,
  RunResult,
  TrialResult,
} from '@eval/engine/runner-loop';
import { pct1 } from '../../shared/format';
import { KNOWN_COL_KEYS, type ColKey, type SortSpec } from '../cli/cli-args';
import { orderMetricCols, sortVariants } from '../cli/console-printer';
import {
  computeRunningStats,
  sortVariantNamesByStats,
  type RunningStats,
} from './aggregate';
import { CATEGORY_DESCRIPTIONS_FR } from '@eval/engine/categories';
import {
  buildAxisColumns,
  Cell,
  COLUMNS_BY_KEY,
  EMPTY,
  METRIC_COLUMNS,
  VariantTable,
  type AxisKey,
  type VariantDescriptor,
} from './components/VariantTable';
import type { DisplayOptions } from './store';

type Meta = {
  trialCount: number;
  cases: number;
  variants: number;
};

/** Structural shape of `EvalEngine` consumed by the TUI: events + run.
 *  Decouples from the generic class to sidestep TS class-generic invariance,
 *  same rationale as `EventSubscribable` for the console printer. */
type EngineRunner = EventSubscribable & {
  run: (opts: RunOpts) => Promise<RunResult>;
};

type Props = {
  engine: EngineRunner;
  runOpts: RunOpts;
  subjectName: string;
  meta: Meta;
  caseSlugs: string[];
  /** Slug → original case input text, for the `p` toggle (show initial input). */
  caseInputsBySlug?: Map<string, string>;
  variants: VariantDescriptor[];
  sortSpec: SortSpec[];
  /** Seeded display prefs (XDG + CLI). Seeds visible columns; `sections`
   *  is preserved when persisting (App has no sections editor). */
  initialDisplay?: DisplayOptions;
  /** Persist display prefs edited live here (best-effort, debounced). */
  onCommitDisplay?: (display: DisplayOptions) => void;
  onRunComplete: (run: RunResult) => void;
  onExitAction?: (action: 'back' | 'quit') => void;
  /** Post-completion rerun. Does NOT unmount Ink — the wizard restarts in
   *  place (Router resets the engine and returns to the cases page). */
  onRerun?: () => void;
};

type View = 'aggregate' | 'perCase';

type Mode =
  | 'browsing'
  | 'columnsPicker'
  | 'sortPicker'
  | 'filterPicker'
  | 'rawOutput';

type LegendRow = { cat: string; name: string };
type RawTrial = { variant: string; trialIndex: number; output: unknown };

type FilterRow = { axis: AxisKey; axisLabel: string; value: string };

const CATEGORY_VALUE_WIDTH = 6;
type AssertionStats = Map<string, Map<string, { passed: number; total: number }>>;

const EMPTY_STATS_MAP: Map<string, RunningStats> = new Map();

// Single definition shared by the ordering source (buildCategoryArtifacts)
// and the display (CategoriesPane) — forking these would let the sort and the
// `×w`/`×Σ` tags silently disagree.
const weightOf = (
  weightByCatName: Map<string, Map<string, number>>,
  cat: string,
  name: string,
): number => weightByCatName.get(cat)?.get(name) ?? 1;

const categoryWeightOf = (
  weightByCatName: Map<string, Map<string, number>>,
  namesByCategory: Map<string, string[]>,
  cat: string,
): number =>
  (namesByCategory.get(cat) ?? []).reduce(
    (s, n) => s + weightOf(weightByCatName, cat, n),
    0,
  );

// Ordering is single-source: categories are sorted by DERIVED weight
// (Σ of their assertions' weights) descending, ties broken alphabetically;
// assertions within a category by their own weight descending, ties by name.
// Every consumer (header row, variant rows, vertical legend, legendRows
// selection index, collectTrials) reads these same ordered arrays, so the
// pane never desyncs.
const buildCategoryArtifacts = (
  trialGroups: Iterable<TrialResult[]>,
): {
  orderedCategories: string[];
  stats: AssertionStats;
  names: Map<string, string[]>;
  weightByCatName: Map<string, Map<string, number>>;
  descriptionByCatName: Map<string, Map<string, string>>;
} => {
  const cats = new Set<string>();
  const stats: AssertionStats = new Map();
  const namesSeen = new Map<string, Set<string>>();
  const names = new Map<string, string[]>();
  const weightByCatName = new Map<string, Map<string, number>>();
  const descriptionByCatName = new Map<string, Map<string, string>>();
  for (const trials of trialGroups) {
    for (const t of trials) {
      for (const cat of Object.keys(t.score.metadata.byCategory)) cats.add(cat);
      for (const a of t.score.metadata.allAssertions) {
        let inner = stats.get(a.category);
        if (!inner) {
          inner = new Map();
          stats.set(a.category, inner);
        }
        const cur = inner.get(a.name) ?? { passed: 0, total: 0 };
        cur.total += 1;
        if (a.passed) cur.passed += 1;
        inner.set(a.name, cur);

        let wInner = weightByCatName.get(a.category);
        if (!wInner) {
          wInner = new Map();
          weightByCatName.set(a.category, wInner);
        }
        // Weight is constant per (category, name) across trials.
        wInner.set(a.name, a.weight);

        // Description is constant per (category, name); skip empties so the
        // overlay can fall back to a "(no description)" placeholder.
        if (a.description) {
          let dInner = descriptionByCatName.get(a.category);
          if (!dInner) {
            dInner = new Map();
            descriptionByCatName.set(a.category, dInner);
          }
          dInner.set(a.name, a.description);
        }
      }
    }
    const sample = trials.find((t) => t.status === 'success') ?? trials[0];
    if (!sample) continue;
    for (const a of sample.score.metadata.allAssertions) {
      let seen = namesSeen.get(a.category);
      if (!seen) {
        seen = new Set();
        namesSeen.set(a.category, seen);
      }
      if (seen.has(a.name)) continue;
      seen.add(a.name);
      const arr = names.get(a.category) ?? [];
      arr.push(a.name);
      names.set(a.category, arr);
    }
  }

  for (const [cat, arr] of names) {
    arr.sort(
      (a, b) =>
        weightOf(weightByCatName, cat, b) -
          weightOf(weightByCatName, cat, a) || a.localeCompare(b),
    );
  }
  const orderedCategories = Array.from(cats).sort(
    (a, b) =>
      categoryWeightOf(weightByCatName, names, b) -
        categoryWeightOf(weightByCatName, names, a) || a.localeCompare(b),
  );

  return {
    orderedCategories,
    stats,
    names,
    weightByCatName,
    descriptionByCatName,
  };
};


export const App: React.FC<Props> = ({
  engine,
  runOpts,
  subjectName,
  meta,
  caseSlugs,
  caseInputsBySlug,
  variants,
  sortSpec: initialSortSpec,
  initialDisplay,
  onCommitDisplay,
  onRunComplete,
  onExitAction,
  onRerun,
}) => {
  const [trialsByVariantByCase, setTrialsByVariantByCase] = useState<
    Map<string, Map<string, TrialResult[]>>
  >(new Map());
  const [view, setView] = useState<View>('aggregate');
  const [completedResult, setCompletedResult] = useState<RunResult | null>(null);
  const [mode, setMode] = useState<Mode>('browsing');
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    () => new Set(initialDisplay?.cols ?? KNOWN_COL_KEYS),
  );
  const [focusedCol, setFocusedCol] = useState<ColKey>('score');
  const [pickerSelectedIdx, setPickerSelectedIdx] = useState(0);
  const [sortPickerSelectedIdx, setSortPickerSelectedIdx] = useState(0);
  const [sortSpec, setSortSpec] = useState<SortSpec[]>(initialSortSpec);
  const [showCategoriesPane, setShowCategoriesPane] = useState(false);
  // Single browsing cursor over the table rows: 0 = header (aggregate
  // scorer target), 1..N = the Nth ordered visible variant. `legendFocused`
  // is the explicit sub-mode in which ↑↓/Enter drive the legend instead of
  // the row cursor — no more implicit dual ownership of ↑↓.
  const [rowCursor, setRowCursor] = useState(0);
  const [legendFocused, setLegendFocused] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [filterPickerSelectedIdx, setFilterPickerSelectedIdx] = useState(0);
  const [filterSelection, setFilterSelection] = useState<Map<AxisKey, Set<string>>>(
    () => {
      const m = new Map<AxisKey, Set<string>>();
      for (const ac of buildAxisColumns(variants)) {
        m.set(ac.key, new Set(variants.map((v) => ac.get(v))));
      }
      return m;
    },
  );
  const [legendSelIdx, setLegendSelIdx] = useState(0);
  const [rawTrials, setRawTrials] = useState<RawTrial[]>([]);
  const [rawAssertion, setRawAssertion] = useState<LegendRow | null>(null);
  const [rawScroll, setRawScroll] = useState(0);
  const [rawPass, setRawPass] = useState(false);
  const rawMaxScrollRef = useRef(0);
  // Index of the focused case-block in the multi-case per-case view. Doubles
  // as the scroll anchor — the rendered window starts at this index — and as
  // the cursor for Tab/Shift+Tab horizontal navigation between cases.
  // Bounds the view to the terminal height — same anti-scroll design intent
  // as the rawOutput viewport (never a manual \x1b clear).
  const [perCaseFocusedCaseIdx, setPerCaseFocusedCaseIdx] = useState(0);
  const { exit } = useApp();

  // No manual screen clear on browsing↔rawOutput transitions: Ink's renderer
  // (log-update) already erases its previous frame before writing the new one,
  // and the overlay viewport is bounded to the terminal height so it never
  // scrolls the terminal. A manual \x1b[2J/3J races Ink's 32ms-throttled
  // writer — it clears the screen while Ink's repaint is deferred yet Ink
  // marks the frame as already drawn, leaving a black screen until the next
  // differing frame (a keypress) forces a write.

  // Cap the case/input box so it doesn't sprawl on ultrawide terminals while
  // still fitting narrow ones (-2 for the round border columns).
  const inputBoxWidth = Math.min(100, (process.stdout.columns ?? 100) - 2);
  const singleCase = caseSlugs.length === 1;

  const visibleColumns = METRIC_COLUMNS.filter((c) => visibleCols.has(c.key));
  const orderedVisibleColumns = orderMetricCols(visibleColumns, null, sortSpec);

  const axisColumns = useMemo(() => buildAxisColumns(variants), [variants]);

  const visibleVariantNames = useMemo(() => {
    const result = new Set<string>();
    for (const v of variants) {
      let pass = true;
      for (const ac of axisColumns) {
        const sel = filterSelection.get(ac.key);
        if (sel && !sel.has(ac.get(v))) {
          pass = false;
          break;
        }
      }
      if (pass) result.add(v.name);
    }
    return result;
  }, [variants, axisColumns, filterSelection]);

  const isFilterActive = visibleVariantNames.size < variants.length;

  // Variant render order: post-completion, honor sortSpec. During the live
  // stream, keep prop order — re-sorting per trial would flicker the table.
  // Filter is applied AFTER sort so the visible order matches the sort.
  const orderedVariantNames = (
    completedResult && sortSpec.length > 0
      ? sortVariants(completedResult.variants, sortSpec, meta.trialCount).map(
          (v) => v.name,
        )
      : variants.map((v) => v.name)
  ).filter((name) => visibleVariantNames.has(name));

  const statsByCaseByName = useMemo(() => {
    const out = new Map<string, Map<string, RunningStats>>();
    if (view !== 'perCase') return out;
    for (const [name, innerByCase] of trialsByVariantByCase) {
      if (!visibleVariantNames.has(name)) continue;
      for (const [slug, trials] of innerByCase) {
        const bucket = out.get(slug) ?? new Map<string, RunningStats>();
        bucket.set(name, computeRunningStats(trials, meta.trialCount));
        out.set(slug, bucket);
      }
    }
    return out;
  }, [view, trialsByVariantByCase, visibleVariantNames, meta.trialCount]);

  const activeCaseSlugs = useMemo(
    () => caseSlugs.filter((slug) => (statsByCaseByName.get(slug)?.size ?? 0) > 0),
    [caseSlugs, statsByCaseByName],
  );

  const focusedCaseSlug =
    view === 'perCase'
      ? activeCaseSlugs[perCaseFocusedCaseIdx] ?? null
      : null;

  // Extracted so focusedCaseOrder's memo invalidates only when THIS case's
  // stats change — depending on the whole statsByCaseByName map would bust it
  // on every trial event for any case during the live stream.
  const focusedCaseStats = focusedCaseSlug
    ? statsByCaseByName.get(focusedCaseSlug) ?? null
    : null;

  const focusedCaseOrder = useMemo(() => {
    if (!focusedCaseStats || !completedResult || sortSpec.length === 0) {
      return orderedVariantNames;
    }
    return sortVariantNamesByStats(orderedVariantNames, focusedCaseStats, sortSpec);
  }, [focusedCaseStats, completedResult, sortSpec, orderedVariantNames]);

  // Length equals orderedVariantNames.length (same visibility filter applied),
  // so the rowCursor clamp bound is identical between views.
  const cursorRowOrder =
    view === 'perCase' ? focusedCaseOrder : orderedVariantNames;
  const clampedRowCursor = Math.min(rowCursor, cursorRowOrder.length);
  const cursorVariant =
    clampedRowCursor === 0
      ? null
      : cursorRowOrder[clampedRowCursor - 1] ?? null;

  // Navigate in the order columns actually appear on screen (sort-driven).
  // When `focusedCol` has been hidden, findIndex returns -1; treat it as 0
  // so the next/prev step lands on a sensible visible column.
  const cycleFocus = (delta: 1 | -1) => {
    const n = orderedVisibleColumns.length;
    if (n === 0) return;
    const idx = orderedVisibleColumns.findIndex((c) => c.key === focusedCol);
    const base = idx === -1 ? 0 : idx;
    setFocusedCol(orderedVisibleColumns[(base + delta + n) % n].key);
  };

  const ensureSortDirection = (direction: SortSpec['direction']) => {
    if (!visibleCols.has(focusedCol)) return;
    setSortSpec((prev) => {
      const existing = prev.find((s) => s.key === focusedCol);
      if (existing && existing.direction === direction) return prev;
      if (existing) {
        return prev.map((s) =>
          s.key === focusedCol ? { ...s, direction } : s,
        );
      }
      return [...prev, { key: focusedCol, direction }];
    });
  };

  const hideFocusedCol = () => {
    if (!visibleCols.has(focusedCol)) return;
    const idx = orderedVisibleColumns.findIndex((c) => c.key === focusedCol);
    const nextFocus =
      orderedVisibleColumns[idx + 1]?.key
      ?? orderedVisibleColumns[idx - 1]?.key
      ?? focusedCol;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.delete(focusedCol);
      return next;
    });
    if (nextFocus !== focusedCol) setFocusedCol(nextFocus);
  };

  useInput((input, key) => {
    if (mode === 'rawOutput') {
      if (key.escape) {
        setMode('browsing');
      } else if (key.upArrow || input === 'k') {
        setRawScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow || input === 'j') {
        setRawScroll((s) => Math.min(rawMaxScrollRef.current, s + 1));
      } else if (key.tab && rawAssertion) {
        openTrials(rawAssertion, !rawPass);
      } else if (input === 'q') {
        onExitAction?.('quit');
        exit();
      }
      return;
    }

    if (mode === 'columnsPicker') {
      if (key.upArrow) {
        setPickerSelectedIdx(
          (prev) => (prev - 1 + KNOWN_COL_KEYS.length) % KNOWN_COL_KEYS.length,
        );
      } else if (key.downArrow) {
        setPickerSelectedIdx((prev) => (prev + 1) % KNOWN_COL_KEYS.length);
      } else if (input === ' ') {
        const target = KNOWN_COL_KEYS[pickerSelectedIdx];
        setVisibleCols((prev) => {
          const next = new Set(prev);
          if (next.has(target)) {
            next.delete(target);
          } else {
            next.add(target);
          }
          return next;
        });
      } else if (key.escape) {
        setMode('browsing');
      }
      return;
    }

    if (mode === 'filterPicker') {
      if (key.escape) {
        setMode('browsing');
        return;
      }
      if (filterRows.length === 0) return;
      if (key.upArrow) {
        setFilterPickerSelectedIdx(
          (prev) => (prev - 1 + filterRows.length) % filterRows.length,
        );
      } else if (key.downArrow) {
        setFilterPickerSelectedIdx((prev) => (prev + 1) % filterRows.length);
      } else if (input === ' ') {
        const row = filterRows[filterPickerSelectedIdx];
        if (!row) return;
        setFilterSelection((prev) => {
          const next = new Map(prev);
          const set = new Set(next.get(row.axis) ?? []);
          if (set.has(row.value)) set.delete(row.value);
          else set.add(row.value);
          next.set(row.axis, set);
          return next;
        });
      }
      return;
    }

    if (mode === 'sortPicker') {
      if (key.escape) {
        setMode('browsing');
        return;
      }
      if (sortSpec.length === 0) return;
      const idx = sortPickerSelectedIdx;
      if (key.upArrow) {
        setSortPickerSelectedIdx((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSortPickerSelectedIdx((prev) =>
          Math.min(sortSpec.length - 1, prev + 1),
        );
      } else if (input === 'K') {
        if (idx === 0) return;
        setSortSpec((prev) => {
          const next = [...prev];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          return next;
        });
        setSortPickerSelectedIdx(idx - 1);
      } else if (input === 'J') {
        if (idx >= sortSpec.length - 1) return;
        setSortSpec((prev) => {
          const next = [...prev];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          return next;
        });
        setSortPickerSelectedIdx(idx + 1);
      } else if (input === ' ') {
        setSortSpec((prev) =>
          prev.map((s, i) =>
            i === idx
              ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }
              : s,
          ),
        );
      } else if (input === 'x') {
        const nextLen = sortSpec.length - 1;
        setSortSpec((prev) => prev.filter((_, i) => i !== idx));
        setSortPickerSelectedIdx((prev) =>
          Math.max(0, Math.min(prev, nextLen - 1)),
        );
      }
      return;
    }

    // Legend sub-mode: while focused it exclusively owns ↑↓ / Enter / Esc.
    // Entered with Enter when the scorer pane is open; Esc returns to the
    // single row cursor. This replaces the old implicit "legend silently
    // owns ↑↓ whenever the pane is open" dual cursor.
    if (legendFocused) {
      if (key.escape) {
        setLegendFocused(false);
      } else if (key.upArrow) {
        setLegendSelIdx((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setLegendSelIdx((i) => Math.min(legendRows.length - 1, i + 1));
      } else if (key.return) {
        const row = legendRows[clampedLegendSel];
        if (row) {
          openTrials(row, false);
          setMode('rawOutput');
        }
      } else if (input === 'q') {
        onExitAction?.('quit');
        exit();
      }
      return;
    }

    // Tab with only 1 active case falls through to cycleFocus (column nav) so
    // single-case perCase stays usable as a column-focused table.
    if (view === 'perCase') {
      if (key.tab && activeCaseSlugs.length > 1) {
        // Legend index reset on Tab — assertion identity isn't stable across
        // cases (sort order differs), so a name-preserving carry would mislead.
        if (legendFocused) setLegendSelIdx(0);
        const n = activeCaseSlugs.length;
        setPerCaseFocusedCaseIdx((i) =>
          key.shift ? (i - 1 + n) % n : (i + 1) % n,
        );
        return;
      }
      if (input === 'k') {
        setRowCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (input === 'j') {
        setRowCursor((c) => Math.min(cursorRowOrder.length, c + 1));
        return;
      }
    }

    // The single browsing cursor: ↑↓ walks the table rows (0 = header =
    // scorer target, 1..N = a variant). The scorer pane (`i`) scopes to it
    // live. In perCase the bound is the focused case's variant count
    // (cursorRowOrder); in aggregate it's orderedVariantNames. Left/right
    // stay free for column focus.
    if (key.upArrow) {
      setRowCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setRowCursor((c) => Math.min(cursorRowOrder.length, c + 1));
      return;
    }
    if (key.return) {
      if (canFocusLegend) {
        setLegendSelIdx(0);
        setLegendFocused(true);
      }
      return;
    }

    if (input === 'c') {
      setMode('columnsPicker');
    } else if (input === 's') {
      setSortPickerSelectedIdx(0);
      setMode('sortPicker');
    } else if (input === 'f') {
      setFilterPickerSelectedIdx(0);
      setMode('filterPicker');
    } else if (input === 'g') {
      setPerCaseFocusedCaseIdx(0);
      setView((prev) => (prev === 'aggregate' ? 'perCase' : 'aggregate'));
    } else if (input === 'r' && completedResult && onRerun) {
      // Restart the wizard in place — no Ink exit, Router resets the engine.
      onRerun();
    } else if (input === 'q') {
      onExitAction?.('quit');
      exit();
    } else if (input === 'b') {
      if (meta.cases === 0) return;
      // Back must NOT exit() Ink — that unmounts the whole TUI. The Router
      // handles 'back' by navigating in place (same as rerun). Only 'quit'
      // tears Ink down.
      onExitAction?.('back');
    } else if (input === 'a') {
      ensureSortDirection('asc');
    } else if (input === 'd') {
      ensureSortDirection('desc');
    } else if (input === 'h') {
      hideFocusedCol();
    } else if (input === 'i') {
      setShowCategoriesPane((prev) => !prev);
    } else if (input === 'p' && singleCase) {
      setShowInput((prev) => !prev);
    } else if (key.tab || key.rightArrow) {
      cycleFocus(1);
    } else if (key.leftArrow) {
      cycleFocus(-1);
    }
  });

  useEffect(() => {
    const unsubscribe = engine.on((event) => {
      if (event.kind === 'trialCompleted') {
        setTrialsByVariantByCase((prev) => {
          const next = new Map(prev);
          const innerPrev = next.get(event.variantName);
          const inner = innerPrev ? new Map(innerPrev) : new Map<string, TrialResult[]>();
          const arr = inner.get(event.caseSlug) ?? [];
          inner.set(event.caseSlug, [...arr, event.trial]);
          next.set(event.variantName, inner);
          return next;
        });
      } else if (event.kind === 'runCompleted') {
        setCompletedResult(event.result);
        onRunComplete(event.result);
        // Stay mounted after the run completes so the user can navigate
        // column focus and read the table. Exit only on 'q'.
      }
    });

    engine.run(runOpts).catch((err: unknown) => {
      exit(err instanceof Error ? err : new Error(String(err)));
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist display prefs edited live here (sort/columns) so they stick
  // across runs — this replaces the removed pre-run DisplayPage step.
  // `sections` has no editor in the result view, so it is preserved from
  // the seeded prefs. Debounced to avoid write thrash on rapid toggles;
  // savePrefs is best-effort fire-and-forget.
  useEffect(() => {
    if (!onCommitDisplay) return;
    const t = setTimeout(() => {
      onCommitDisplay({
        sections: initialDisplay?.sections ?? new Set(),
        cols: visibleCols,
        sort: sortSpec,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [visibleCols, sortSpec, onCommitDisplay, initialDisplay]);

  // Moving the row cursor re-scopes the pane → its legend rows change, so
  // reset the legend selection and leave legend focus to avoid a stale
  // index pointing at a now-absent assertion.
  useEffect(() => {
    setLegendSelIdx(0);
    setLegendFocused(false);
  }, [cursorVariant]);

  const variantsByName = useMemo(
    () => new Map(variants.map((v) => [v.name, v])),
    [variants],
  );

  const trialsByVariant = useMemo(() => {
    const out = new Map<string, TrialResult[]>();
    for (const [name, inner] of trialsByVariantByCase) {
      const flat: TrialResult[] = [];
      for (const trials of inner.values()) flat.push(...trials);
      out.set(name, flat);
    }
    return out;
  }, [trialsByVariantByCase]);

  const filterRows = useMemo<FilterRow[]>(() => {
    const rows: FilterRow[] = [];
    for (const ac of axisColumns) {
      const seen = new Set<string>();
      const values: string[] = [];
      for (const v of variants) {
        const val = ac.get(v);
        if (!seen.has(val)) {
          seen.add(val);
          values.push(val);
        }
      }
      values.sort();
      for (const value of values) {
        rows.push({ axis: ac.key, axisLabel: ac.label, value });
      }
    }
    return rows;
  }, [variants, axisColumns]);

  const visibleTrialsByVariant = useMemo(() => {
    const out = new Map<string, TrialResult[]>();
    for (const [name, trials] of trialsByVariant) {
      if (visibleVariantNames.has(name)) out.set(name, trials);
    }
    return out;
  }, [trialsByVariant, visibleVariantNames]);

  const aggregateCategoryInfo = useMemo(() => {
    const { orderedCategories, stats, names, weightByCatName, descriptionByCatName } =
      buildCategoryArtifacts(visibleTrialsByVariant.values());
    return {
      allCategories: orderedCategories,
      assertionStats: stats,
      assertionNamesByCategory: names,
      weightByCatName,
      descriptionByCatName,
    };
  }, [visibleTrialsByVariant]);
  // Scope the scorer pane to the cursor: a variant row → that variant's
  // trials only; the header row (cursorVariant === null) → the aggregate.
  // `buildCategoryArtifacts` is already parametric on trial groups, so a
  // single-variant view is just feeding it that one variant's trials.
  const paneCategoryInfo = useMemo(() => {
    const groups: TrialResult[][] = [];
    if (view === 'perCase') {
      if (!focusedCaseSlug) return aggregateCategoryInfo;
      if (cursorVariant) {
        const trials = trialsByVariantByCase.get(cursorVariant)?.get(focusedCaseSlug);
        if (trials) groups.push(trials);
      } else {
        for (const [name, innerByCase] of trialsByVariantByCase) {
          if (!visibleVariantNames.has(name)) continue;
          const trials = innerByCase.get(focusedCaseSlug);
          if (trials) groups.push(trials);
        }
      }
    } else {
      if (!cursorVariant) return aggregateCategoryInfo;
      const trials = visibleTrialsByVariant.get(cursorVariant);
      if (trials) groups.push(trials);
    }
    const { orderedCategories, stats, names, weightByCatName, descriptionByCatName } =
      buildCategoryArtifacts(groups);
    return {
      allCategories: orderedCategories,
      assertionStats: stats,
      assertionNamesByCategory: names,
      weightByCatName,
      descriptionByCatName,
    };
  }, [
    view,
    focusedCaseSlug,
    cursorVariant,
    aggregateCategoryInfo,
    visibleTrialsByVariant,
    trialsByVariantByCase,
    visibleVariantNames,
  ]);
  const {
    allCategories,
    assertionStats,
    assertionNamesByCategory,
    weightByCatName,
    descriptionByCatName,
  } = paneCategoryInfo;

  // Category-major order MUST match CategoriesPane's legend render order.
  const legendRows = useMemo<LegendRow[]>(() => {
    const rows: LegendRow[] = [];
    for (const cat of allCategories) {
      for (const name of assertionNamesByCategory.get(cat) ?? []) {
        rows.push({ cat, name });
      }
    }
    return rows;
  }, [allCategories, assertionNamesByCategory]);

  const canFocusLegend = showCategoriesPane && legendRows.length > 0;

  // Closing the pane (or it having no legend rows) must drop legend focus.
  useEffect(() => {
    if (legendFocused && !canFocusLegend) setLegendFocused(false);
  }, [legendFocused, canFocusLegend]);

  // Built once per trial set, not per scroll keypress.
  const rawLines = useMemo<string[]>(() => {
    if (rawTrials.length === 0) {
      return [
        rawPass
          ? '(no passing trials for this assertion)'
          : '(no failing trials for this assertion)',
      ];
    }
    const out: string[] = [];
    for (const f of rawTrials) {
      out.push(`── ${f.variant} · trial #${f.trialIndex} ──`);
      let json: string;
      try {
        json = JSON.stringify(f.output, null, 2);
      } catch {
        json = String(f.output);
      }
      for (const l of json.split('\n')) out.push(l);
      out.push('');
    }
    return out;
  }, [rawTrials, rawPass]);

  const clampedLegendSel =
    legendRows.length === 0
      ? 0
      : Math.min(legendSelIdx, legendRows.length - 1);

  // (cat,name) can appear more than once in one trial's allAssertions, so
  // failed/passed are NOT naive complements: a trial passing it once and
  // failing it elsewhere would match both. FAILED = "failed at least once"
  // (unchanged); PASSED = "present and passed everywhere".
  const collectTrials = (row: LegendRow, wantPassed: boolean): RawTrial[] => {
    const out: RawTrial[] = [];
    let trialsSource: Iterable<[string, TrialResult[]]> = visibleTrialsByVariant;
    if (view === 'perCase' && focusedCaseSlug) {
      const entries: Array<[string, TrialResult[]]> = [];
      for (const [variant, innerByCase] of trialsByVariantByCase) {
        if (!visibleVariantNames.has(variant)) continue;
        const trials = innerByCase.get(focusedCaseSlug);
        if (trials) entries.push([variant, trials]);
      }
      trialsSource = entries;
    }
    for (const [variant, trials] of trialsSource) {
      if (cursorVariant && variant !== cursorVariant) continue;
      for (const t of trials) {
        const matches = t.score.metadata.allAssertions.filter(
          (a) => a.category === row.cat && a.name === row.name,
        );
        if (matches.length === 0) continue;
        const include = wantPassed
          ? matches.every((m) => m.passed)
          : matches.some((m) => !m.passed);
        if (include) {
          out.push({ variant, trialIndex: t.index, output: t.output });
        }
      }
    }
    return out;
  };

  // Trials and the pass flag must always move together — single entry point.
  const openTrials = (row: LegendRow, wantPassed: boolean) => {
    setRawAssertion(row);
    setRawPass(wantPassed);
    setRawTrials(collectTrials(row, wantPassed));
    setRawScroll(0);
  };

  const statsByName = useMemo(() => {
    const m = new Map<string, RunningStats>();
    for (const [name, trials] of visibleTrialsByVariant) {
      m.set(name, computeRunningStats(trials, meta.trialCount));
    }
    return m;
  }, [visibleTrialsByVariant, meta.trialCount]);

  // Matrix scope mirrors paneCategoryInfo: single focused variant, or all.
  const paneStatsByVariant: Map<string, RunningStats> = cursorVariant
    ? new Map(
        statsByName.has(cursorVariant)
          ? [[cursorVariant, statsByName.get(cursorVariant)!]]
          : [],
      )
    : statsByName;
  const paneVariantNames = cursorVariant
    ? statsByName.has(cursorVariant)
      ? [cursorVariant]
      : []
    : orderedVariantNames;

  // The render-time window clamps `start` for the paint, but the raw
  // focused-case index must also be clamped or scrolling back up needs
  // phantom ↑ presses after a filter shrinks the active set.
  useEffect(() => {
    const lastStart = Math.max(0, activeCaseSlugs.length - 1);
    setPerCaseFocusedCaseIdx((s) => (s > lastStart ? lastStart : s));
  }, [activeCaseSlugs.length]);

  // Bound the multi-case per-case view to the terminal height so it never
  // scrolls the terminal: Ink's log-update can only erase lines it last
  // drew, so an overflowing tree leaves a stale/duplicated frame on the next
  // paint (the documented hazard — same reason rawOutput is height-bounded).
  // The per-case height estimate is deliberately conservative: over-counting
  // only under-fills a page (safe), under-counting re-introduces the bug.
  const perCaseWindow = (() => {
    const total = activeCaseSlugs.length;
    const termRows = process.stdout.rows ?? 24;
    const termCols = process.stdout.columns ?? 100;
    const variantRows = orderedVariantNames.length;
    // Fixed chrome (title, meta, optional filter/view lines, indicator,
    // footer, padding) PLUS the multi-case slug header `cases (N): a, b, …`
    // which wraps and is unbounded — estimate its wrapped height too.
    const slugHeaderLen =
      `cases (${activeCaseSlugs.length}): ${activeCaseSlugs.join(', ')}`.length;
    const slugHeaderRows = Math.max(
      1,
      Math.ceil(slugHeaderLen / Math.max(20, termCols)),
    );
    const budget = Math.max(8, termRows - 12 - slugHeaderRows);
    const inputWidth = Math.max(20, inputBoxWidth - 2);
    // Pane only renders on the focused case (single browsing cursor), so
    // paneH only counts there — non-focused blocks are table-only.
    const blockHeight = (slug: string, isFirst: boolean): number => {
      const inputLen = (caseInputsBySlug?.get(slug) ?? '').length || 1;
      const inputLines = Math.max(1, Math.ceil(inputLen / inputWidth));
      const boxH = 2 + 1 + 1 + inputLines;
      const tableH = variantRows + 3;
      let paneH = 0;
      if (showCategoriesPane && slug === focusedCaseSlug) {
        let n = 0;
        for (const list of assertionNamesByCategory.values()) {
          n += 1 + list.length;
        }
        // Pane real height = category header (1) + per-variant pct rows
        // (variantRows) + marginTop (1) + legend Σ(1+len); +1 slack.
        paneH = variantRows + 3 + n;
      }
      return (isFirst ? 0 : 1) + boxH + Math.max(tableH, paneH);
    };
    // Pre-measure every active case so we can decide: does the whole set fit?
    // If yes → show everything (no scroll, no truncation, even when the user
    // tabs around). Only when the cumulative height exceeds the budget do we
    // fall back to a sliding window anchored on focusedCaseIdx.
    const heights: number[] = [];
    let totalHeight = 0;
    for (let k = 0; k < total; k += 1) {
      const h = blockHeight(activeCaseSlugs[k], k === 0);
      heights.push(h);
      totalHeight += h;
    }
    const focusedIdx = Math.min(perCaseFocusedCaseIdx, Math.max(0, total - 1));
    let start = 0;
    let end = total;
    if (totalHeight > budget) {
      // Sliding window: include focusedIdx, then greedily extend forward
      // (priority) and backward to fill the remaining budget.
      start = focusedIdx;
      end = focusedIdx + 1;
      let used = heights[focusedIdx] ?? 0;
      while (end < total && used + (heights[end] ?? 0) <= budget) {
        used += heights[end] ?? 0;
        end += 1;
      }
      while (start > 0 && used + (heights[start - 1] ?? 0) <= budget) {
        start -= 1;
        used += heights[start] ?? 0;
      }
    }
    return { start, end, total, slugs: activeCaseSlugs.slice(start, end) };
  })();
  const perCaseHasMore =
    perCaseWindow.start > 0 || perCaseWindow.end < perCaseWindow.total;

  const renderVariantTable = (
    stats: Map<string, RunningStats>,
    focus?: { focusedVariantName?: string; headerFocused?: boolean },
    orderedNames: string[] = orderedVariantNames,
  ): React.ReactElement => (
    <VariantTable
      stats={stats}
      orderedVariantNames={orderedNames}
      variantsByName={variantsByName}
      axisColumns={axisColumns}
      orderedVisibleColumns={orderedVisibleColumns}
      focusedColKey={mode === 'browsing' ? focusedCol : undefined}
      focusedVariantName={focus?.focusedVariantName}
      headerFocused={focus?.headerFocused}
    />
  );

  if (mode === 'rawOutput' && rawAssertion) {
    const termRows = process.stdout.rows ?? 24;
    // The frame's non-content chrome is 9 lines: padding (2) + Scorer (1) +
    // Parent (1) + PASSED/FAILED (1) + count (1) + marginTop before the
    // lines (1) + footer block (marginTop + text = 2). Reserve 10 (chrome +
    // 1 slack) so the TOTAL height stays ≤ termRows: if it ever exceeds,
    // the terminal scrolls and Ink's log-update can no longer erase the
    // scrolled-off lines, leaving the stale raw dump above the result view
    // on Esc back (the documented browsing↔rawOutput hazard). Bounding it
    // here is the design intent — never a manual \x1b clear.
    const viewport = Math.max(3, termRows - 10);
    const maxScroll = Math.max(0, rawLines.length - viewport);
    rawMaxScrollRef.current = maxScroll;
    const start = Math.min(rawScroll, maxScroll);
    const visible = rawLines.slice(start, start + viewport);
    const end = start + visible.length;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Scorer: {rawAssertion.name}
        </Text>
        <Text>
          <Text bold>Parent: {rawAssertion.cat}</Text>
          {CATEGORY_DESCRIPTIONS_FR[rawAssertion.cat] ? (
            <Text dimColor> — {CATEGORY_DESCRIPTIONS_FR[rawAssertion.cat]}</Text>
          ) : null}
        </Text>
        <Text bold color={rawPass ? 'green' : 'red'}>
          {rawPass ? 'PASSED' : 'FAILED'} trials
        </Text>
        <Text dimColor>
          {rawTrials.length} {rawPass ? 'passing' : 'failing'} trial(s) · lines {rawLines.length === 0 ? 0 : start + 1}-{end}/{rawLines.length}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {visible.map((l, i) => (
            <Text key={start + i}>{l === '' ? ' ' : l}</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓/j k scroll · Tab failed/passed · Esc back · q quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{subjectName}</Text>
      <Text dimColor>
        {meta.cases} case(s) × {meta.trialCount} trial(s) × {meta.variants} variant(s)
      </Text>
      {caseSlugs.length === 1 ? (
        <Box
          marginTop={1}
          flexDirection="column"
          borderStyle="round"
          paddingX={1}
          width={inputBoxWidth}
        >
          <Text bold color="cyan">
            case: {caseSlugs[0]}
          </Text>
          {showInput && (
            <Box marginTop={1}>
              <Text dimColor wrap="wrap">
                {caseInputsBySlug?.get(caseSlugs[0]) ?? '(input unavailable)'}
              </Text>
            </Box>
          )}
        </Box>
      ) : caseSlugs.length > 1 ? (
        // Multi-case: list slugs only. `p` (single-input toggle) is disabled
        // here — per-case inputs are shown in the per-case view (`g`).
        <Text bold color="cyan">
          cases ({caseSlugs.length}): {caseSlugs.join(', ')}
        </Text>
      ) : null}
      {isFilterActive && (
        <Text color="yellow">
          filter: {visibleVariantNames.size}/{variants.length} variants
        </Text>
      )}
      {view === 'perCase' && (
        <Text color="cyan">view: per-case ({activeCaseSlugs.length} cases)</Text>
      )}

      {view === 'aggregate' ? (
        <Box marginTop={1} flexDirection="row">
          {renderVariantTable(statsByName, {
            focusedVariantName:
              mode === 'browsing' && cursorVariant ? cursorVariant : undefined,
            headerFocused: mode === 'browsing' && clampedRowCursor === 0,
          })}

          {showCategoriesPane && allCategories.length > 0 && (
            <Box marginLeft={4} flexDirection="row">
              <Box flexDirection="column" marginRight={4}>
                <Text dimColor>│</Text>
                {orderedVariantNames.map((name) => (
                  <Text key={name} dimColor>│</Text>
                ))}
              </Box>
              <CategoriesPane
                allCategories={allCategories}
                assertionStats={assertionStats}
                assertionNamesByCategory={assertionNamesByCategory}
                statsByVariant={paneStatsByVariant}
                orderedVariantNames={paneVariantNames}
                weightByCatName={weightByCatName}
                descriptionByCatName={descriptionByCatName}
                selectedLegendIndex={
                  legendFocused ? clampedLegendSel : undefined
                }
              />
            </Box>
          )}
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {activeCaseSlugs.length === 0 && (
            <Text dimColor>(awaiting trials…)</Text>
          )}
          {perCaseHasMore && (
            <Text color="yellow">
              cases {perCaseWindow.start + 1}-{perCaseWindow.end}/
              {perCaseWindow.total} · Tab cases
            </Text>
          )}
          {perCaseWindow.slugs.map((slug, i) => {
            const isFocusedCase = slug === focusedCaseSlug;
            const caseStats = statsByCaseByName.get(slug) ?? EMPTY_STATS_MAP;
            // Per-case rows sort on THIS case's stats, not the global
            // aggregate. Gated on completedResult so the live stream keeps
            // prop order (no per-trial re-sort flicker), matching the
            // aggregate `orderedVariantNames` rule above. Focused case reuses
            // the memoized focusedCaseOrder.
            const caseOrder = isFocusedCase
              ? focusedCaseOrder
              : completedResult && sortSpec.length > 0
                ? sortVariantNamesByStats(orderedVariantNames, caseStats, sortSpec)
                : orderedVariantNames;
            return (
              <Box key={slug} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
                <Box
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={isFocusedCase ? 'cyan' : 'gray'}
                  paddingX={1}
                  width={inputBoxWidth}
                >
                  <Text bold color={isFocusedCase ? 'cyan' : undefined}>
                    {isFocusedCase ? '▸ ' : '  '}case: {slug}
                  </Text>
                  <Box marginTop={1}>
                    <Text dimColor wrap="wrap">
                      {caseInputsBySlug?.get(slug) ?? '(input unavailable)'}
                    </Text>
                  </Box>
                </Box>
                <Box flexDirection="row">
                  {renderVariantTable(
                    caseStats,
                    isFocusedCase && mode === 'browsing'
                      ? {
                          focusedVariantName: cursorVariant ?? undefined,
                          headerFocused: clampedRowCursor === 0,
                        }
                      : undefined,
                    caseOrder,
                  )}
                  {isFocusedCase && showCategoriesPane && allCategories.length > 0 && (() => {
                    // Pane scope follows cursorVariant: variant row → that
                    // variant only; header row (cursorVariant null) → all of
                    // the focused case's variants. paneCategoryInfo above
                    // already narrowed legend rows the same way.
                    const focusedVariantStats =
                      cursorVariant ? caseStats.get(cursorVariant) : undefined;
                    const paneStats = cursorVariant
                      ? focusedVariantStats
                        ? new Map([[cursorVariant, focusedVariantStats]])
                        : new Map<string, RunningStats>()
                      : caseStats;
                    const paneOrder = cursorVariant
                      ? focusedVariantStats
                        ? [cursorVariant]
                        : []
                      : caseOrder;
                    return (
                      <Box marginLeft={4} flexDirection="row">
                        <Box flexDirection="column" marginRight={4}>
                          <Text dimColor>│</Text>
                          {caseOrder.map((name) => (
                            <Text key={name} dimColor>│</Text>
                          ))}
                        </Box>
                        <CategoriesPane
                          allCategories={allCategories}
                          assertionStats={assertionStats}
                          assertionNamesByCategory={assertionNamesByCategory}
                          statsByVariant={paneStats}
                          orderedVariantNames={paneOrder}
                          weightByCatName={weightByCatName}
                          descriptionByCatName={descriptionByCatName}
                          selectedLegendIndex={
                            legendFocused ? clampedLegendSel : undefined
                          }
                        />
                      </Box>
                    );
                  })()}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {completedResult && (
        <Box marginTop={1}>
          <Text color="green">✓ Run complete.</Text>
        </Box>
      )}

      {mode === 'browsing' && (
        <Box marginTop={1}>
          <Text dimColor>
            {legendFocused
              ? '↑↓ assertion · Enter raw output · Esc back · q quit'
              : view === 'perCase'
                ? `Tab cases · ↑↓/j k row · ←→ col · a/d sort · h hide · c columns · s sort · f filter · g group · i scorer (header=aggregate)${showCategoriesPane ? ' · Enter legend' : ''} · b back · ${completedResult ? 'r rerun · ' : ''}q quit`
                : `↑↓ variant · Tab/←→ col · a/d sort · h hide · c columns · s sort · f filter · g group · i scorer (header=aggregate)${showCategoriesPane ? ' · Enter legend' : ''} · ${singleCase ? 'p prompt · ' : ''}b back · ${completedResult ? 'r rerun · ' : ''}q quit`}
          </Text>
        </Box>
      )}

      {mode === 'columnsPicker' && (
        <ColumnsPicker
          visibleCols={visibleCols}
          selectedIdx={pickerSelectedIdx}
        />
      )}

      {mode === 'sortPicker' && (
        <SortPicker sortSpec={sortSpec} selectedIdx={sortPickerSelectedIdx} />
      )}

      {mode === 'filterPicker' && (
        <FilterPicker
          rows={filterRows}
          selection={filterSelection}
          selectedIdx={filterPickerSelectedIdx}
        />
      )}
    </Box>
  );
};

const ColumnsPicker: React.FC<{
  visibleCols: Set<ColKey>;
  selectedIdx: number;
}> = ({ visibleCols, selectedIdx }) => (
  <Box marginTop={1} flexDirection="column" borderStyle="single" paddingX={1}>
    <Text bold>Columns</Text>
    {KNOWN_COL_KEYS.map((key, idx) => {
      const visible = visibleCols.has(key);
      const col = COLUMNS_BY_KEY.get(key);
      const label = col ? col.label : key;
      const marker = visible ? '[x]' : '[ ]';
      return (
        <Text key={key} inverse={idx === selectedIdx} dimColor={!visible}>
          {`${marker} ${label}`}
        </Text>
      );
    })}
    <Text dimColor>↑↓ nav · Space toggle · Esc close</Text>
  </Box>
);

const SortPicker: React.FC<{
  sortSpec: SortSpec[];
  selectedIdx: number;
}> = ({ sortSpec, selectedIdx }) => (
  <Box marginTop={1} flexDirection="column" borderStyle="single" paddingX={1}>
    <Text bold>Sort</Text>
    {sortSpec.length === 0 ? (
      <Text dimColor>(no sort)</Text>
    ) : (
      sortSpec.map((entry, idx) => {
        const col = COLUMNS_BY_KEY.get(entry.key);
        const label = col ? col.label : entry.key;
        const arrow = entry.direction === 'asc' ? '↑' : '↓';
        return (
          <Text key={entry.key} inverse={idx === selectedIdx}>
            {`[${idx + 1}] ${label} ${arrow}`}
          </Text>
        );
      })
    )}
    <Text dimColor>↑↓ nav · K/J reorder · Space flip · x remove · Esc close</Text>
  </Box>
);

const CategoriesPane: React.FC<{
  allCategories: string[];
  assertionStats: AssertionStats;
  assertionNamesByCategory: Map<string, string[]>;
  statsByVariant: Map<string, RunningStats>;
  orderedVariantNames: string[];
  /** Per (category, assertion name) effective weight — drives the derived
   *  category Σ shown in the header and the `×w` tag on each legend row. */
  weightByCatName: Map<string, Map<string, number>>;
  /** Per (category, assertion name) long-form description — surfaced in the
   *  floating overlay when a scorer is selected. Missing entry → placeholder. */
  descriptionByCatName: Map<string, Map<string, string>>;
  /** Flat index (category-major, same order as App's `legendRows`) of the
   *  highlighted assertion row. `undefined` → selection inactive. */
  selectedLegendIndex?: number;
}> = ({
  allCategories,
  assertionStats,
  assertionNamesByCategory,
  statsByVariant,
  orderedVariantNames,
  weightByCatName,
  descriptionByCatName,
  selectedLegendIndex,
}) => {
  let assertionNameWidth = 0;
  for (const names of assertionNamesByCategory.values()) {
    for (const n of names) {
      if (n.length > assertionNameWidth) assertionNameWidth = n.length;
    }
  }
  const categoryColWidth = (cat: string): number =>
    Math.max(cat.length, CATEGORY_VALUE_WIDTH);

  const legendStartIdx = new Map<string, number>();
  let legendAcc = 0;
  for (const cat of allCategories) {
    legendStartIdx.set(cat, legendAcc);
    legendAcc += (assertionNamesByCategory.get(cat) ?? []).length;
  }

  // Resolve the selected (category, name) + its description, and the line
  // offset of its row INSIDE the legend box. With one header line per category
  // above its rows, the offset of global row S in category C (position idxC in
  // `allCategories`) is `idxC + 1 + S` — idxC preceding headers + C's own
  // header + S rows above it. Drives the floating overlay's marginTop.
  const overlay = ((): {
    name: string;
    description: string;
    top: number;
    left: number;
  } | null => {
    if (selectedLegendIndex === undefined) return null;
    for (let idxC = 0; idxC < allCategories.length; idxC += 1) {
      const cat = allCategories[idxC]!;
      const start = legendStartIdx.get(cat) ?? 0;
      const names = assertionNamesByCategory.get(cat) ?? [];
      if (selectedLegendIndex >= start && selectedLegendIndex < start + names.length) {
        const name = names[selectedLegendIndex - start]!;
        return {
          name,
          description:
            descriptionByCatName.get(cat)?.get(name) ??
            '(pas encore de description pour ce scorer)',
          top: idxC + 1 + selectedLegendIndex,
          // Park the box in the free space to the right of the bullet column
          // (indent + marker + name + weight tag + rate ≈ name width + 18).
          left: assertionNameWidth + 22,
        };
      }
    }
    return null;
  })();
  const OVERLAY_WIDTH = 50;

  return (
    <Box flexDirection="column">
      <Box>
        {allCategories.map((cat, i) => (
          <Box key={cat} marginLeft={i === 0 ? 0 : 2}>
            <Cell
              value={cat}
              width={categoryColWidth(cat)}
              align="right"
              bold
            />
          </Box>
        ))}
      </Box>
      {orderedVariantNames.map((name) => {
        const stats = statsByVariant.get(name);
        return (
          <Box key={name}>
            {allCategories.map((cat, i) => {
              const v = stats?.byCategory[cat];
              return (
                <Box key={cat} marginLeft={i === 0 ? 0 : 2}>
                  <Cell
                    value={v !== undefined ? pct1(v) : EMPTY}
                    width={categoryColWidth(cat)}
                    align="right"
                  />
                </Box>
              );
            })}
          </Box>
        );
      })}
      <Box marginTop={1} flexDirection="column" position="relative">
        {allCategories.map((cat) => {
          const desc = CATEGORY_DESCRIPTIONS_FR[cat];
          const header = desc ? `${cat} — ${desc}` : cat;
          const names = assertionNamesByCategory.get(cat) ?? [];
          const startIdx = legendStartIdx.get(cat) ?? 0;
          return (
            <Box key={cat} flexDirection="column">
              <Text>{`${header}  ×${categoryWeightOf(weightByCatName, assertionNamesByCategory, cat)}`}</Text>
              {names.map((name, j) => {
                const selected = startIdx + j === selectedLegendIndex;
                const s = assertionStats.get(cat)?.get(name);
                const rate =
                  s && s.total > 0 ? pct1(s.passed / s.total) : EMPTY;
                const wTag = `×${weightOf(weightByCatName, cat, name)}`.padStart(4);
                return (
                  <Text key={name} inverse={selected}>
                    {`  ${selected ? '▸' : '·'} ${name.padEnd(assertionNameWidth)}  ${wTag}  ${rate.padStart(CATEGORY_VALUE_WIDTH)}`}
                  </Text>
                );
              })}
            </Box>
          );
        })}
        {selectedLegendIndex !== undefined && (
          <Text dimColor>
            {'  ↑↓ select assertion · Enter raw output of failures'}
          </Text>
        )}
        {overlay && (
          <Box
            position="absolute"
            marginTop={overlay.top}
            marginLeft={overlay.left}
            width={OVERLAY_WIDTH}
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
          >
            <Text bold color="cyan">
              {overlay.name}
            </Text>
            <Text wrap="wrap">{overlay.description}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const FilterPicker: React.FC<{
  rows: FilterRow[];
  selection: Map<AxisKey, Set<string>>;
  selectedIdx: number;
}> = ({ rows, selection, selectedIdx }) => (
  <Box marginTop={1} flexDirection="column" borderStyle="single" paddingX={1}>
    <Text bold>Filter</Text>
    {rows.length === 0 ? (
      <Text dimColor>(no axes available)</Text>
    ) : (
      rows.map((row, idx) => {
        const checked = selection.get(row.axis)?.has(row.value) ?? false;
        const marker = checked ? '[x]' : '[ ]';
        const isAxisStart = idx === 0 || rows[idx - 1].axis !== row.axis;
        return (
          <React.Fragment key={`${row.axis}:${row.value}`}>
            {isAxisStart && <Text bold>{row.axisLabel}</Text>}
            <Text inverse={idx === selectedIdx} dimColor={!checked}>
              {`  ${marker} ${row.value}`}
            </Text>
          </React.Fragment>
        );
      })
    )}
    <Text dimColor>↑↓ nav · Space toggle · Esc close</Text>
  </Box>
);
