/**
 * Renders the REAL `VariantTable` TUI component (offline, no LLM call) to a
 * terminal frame and prints it to stdout. A representative fixture drives it —
 * the columns, widths, alignment and formatting all come from the shipped code
 * (`VariantTable.tsx`, `METRIC_COLUMNS`, `shared/format`).
 *
 * Piped through `scripts/frame-to-png.py` + headless Chrome to produce the
 * README image. Run: `npx tsx scripts/render-readme-image.tsx`.
 */
import React from 'react';
import { render } from 'ink-testing-library';
import {
  VariantTable,
  buildAxisColumns,
  METRIC_COLUMNS,
  type VariantDescriptor,
} from '@eval/clients/tui/components/VariantTable';
import type { ColKey } from '@eval/clients/cli/cli-args';
import type { RunningStats } from '@eval/clients/tui/aggregate';

const variants: VariantDescriptor[] = [
  { name: 'claude-opus-4.7__think-8000', modelId: 'claude-opus-4.7', thinkingBudgetTokens: 8000 },
  { name: 'o3__eff-high', modelId: 'o3', reasoningEffort: 'high' },
  { name: 'gpt-4.1', modelId: 'gpt-4.1' },
  { name: 'gpt-4.1__sys-strict', modelId: 'gpt-4.1', sysPromptName: 'strict' },
];

const stats = new Map<string, RunningStats>([
  ['claude-opus-4.7__think-8000', { avgScore: 0.94, passRate: 0.92, totalCostUsd: 0.83, unitCostUsd: 0.02766, avgLatencyMs: 4200, freshCalls: 24, cacheHits: 6, errorCalls: 0 }],
  ['o3__eff-high',                { avgScore: 0.91, passRate: 0.88, totalCostUsd: 0.61, unitCostUsd: 0.02033, avgLatencyMs: 5100, freshCalls: 27, cacheHits: 3, errorCalls: 0 }],
  ['gpt-4.1',                     { avgScore: 0.86, passRate: 0.83, totalCostUsd: 0.12, unitCostUsd: 0.00400, avgLatencyMs: 1300, freshCalls: 20, cacheHits: 10, errorCalls: 0 }],
  ['gpt-4.1__sys-strict',         { avgScore: 0.79, passRate: 0.75, totalCostUsd: 0.13, unitCostUsd: 0.00433, avgLatencyMs: 1400, freshCalls: 26, cacheHits: 4, errorCalls: 1 }],
]);

const orderedVariantNames = variants.map((v) => v.name);
const variantsByName = new Map(variants.map((v) => [v.name, v]));
const axisColumns = buildAxisColumns(variants);

const VISIBLE: ColKey[] = ['score', 'pass', 'cost', 'latency', 'cached'];
const byKey = new Map(METRIC_COLUMNS.map((c) => [c.key, c]));
const orderedVisibleColumns = VISIBLE.map((k) => byKey.get(k)!).filter(Boolean);

const { lastFrame } = render(
  <VariantTable
    stats={stats}
    orderedVariantNames={orderedVariantNames}
    variantsByName={variantsByName}
    axisColumns={axisColumns}
    orderedVisibleColumns={orderedVisibleColumns}
  />,
);

process.stdout.write(lastFrame() ?? '');
process.stdout.write('\n');
