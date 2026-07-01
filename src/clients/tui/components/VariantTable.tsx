import React from 'react';
import { Box, Text } from 'ink';
import { ms, pct1, usd } from '../../../shared/format';
import type { ColKey } from '../../cli/cli-args';
import type { RunningStats } from '../aggregate';

/**
 * Shared presentational table for the eval TUI. Extracted from `app.tsx` so the
 * live run view (`App`) and the post-run re-display (`PostRunPage`) render the
 * exact same table from a single source — no duplicated column definitions.
 *
 * Pure data in, JSX out: no engine/event coupling, no interactive state. `App`
 * passes `focusedColKey` for its column-focus highlight; `PostRunPage` omits it
 * (static table).
 */

export const EMPTY = '–';

export type VariantDescriptor = {
  name: string;
  modelId: string;
  sysPromptName?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  thinkingBudgetTokens?: number;
};

export type AxisKey = 'model' | 'sys' | 'eff' | 'think';

export type AxisColumn = {
  key: AxisKey;
  label: string;
  width: number;
  get: (v: VariantDescriptor) => string;
  isSet: (v: VariantDescriptor) => boolean;
};

export type Column = {
  key: ColKey;
  label: string;
  width: number;
  align: 'left' | 'right';
  render: (stats: RunningStats | null) => string;
};

/** Parse the sysPrompt segment out of a variant name (`<model>__sys-<name>`).
 *  Lives here so both RunningPage (live) and PostRunPage (from RunResult, which
 *  only carries name+modelId) derive the same value without a cycle. */
export const parseSysPromptName = (variantName: string): string | undefined => {
  const segments = variantName.split('__');
  for (const segment of segments.slice(1)) {
    if (segment.startsWith('sys-')) return segment.slice('sys-'.length);
  }
  return undefined;
};

export const METRIC_COLUMNS: Column[] = [
  { key: 'score',     label: 'Score',   width: 7, align: 'right', render: (s) => (s ? pct1(s.avgScore) : EMPTY) },
  { key: 'pass',      label: 'Pass%',   width: 7, align: 'right', render: (s) => (s ? pct1(s.passRate) : EMPTY) },
  { key: 'cost',      label: 'Total $', width: 9, align: 'right', render: (s) => (s ? usd(s.totalCostUsd) : EMPTY) },
  { key: 'unit-cost', label: '$/trial', width: 9, align: 'right', render: (s) => (s ? usd(s.unitCostUsd, 5) : EMPTY) },
  { key: 'latency',   label: 'Latency', width: 8, align: 'right', render: (s) => (s ? ms(s.avgLatencyMs) : EMPTY) },
  { key: 'fresh',     label: 'Fresh',   width: 6, align: 'right', render: (s) => (s ? String(s.freshCalls) : EMPTY) },
  { key: 'cached',    label: 'Cached',  width: 7, align: 'right', render: (s) => (s ? String(s.cacheHits) : EMPTY) },
  { key: 'errors',    label: 'Errors',  width: 7, align: 'right', render: (s) => (s ? String(s.errorCalls) : EMPTY) },
];

export const COLUMNS_BY_KEY = new Map<ColKey, Column>(
  METRIC_COLUMNS.map((c) => [c.key, c]),
);

export const buildAxisColumns = (
  variants: VariantDescriptor[],
): AxisColumn[] => {
  const candidates: AxisColumn[] = [
    {
      key: 'model',
      label: 'Model',
      width: 0,
      get: (v) => v.modelId,
      isSet: () => true,
    },
    {
      key: 'sys',
      label: 'System Prompt',
      width: 0,
      get: (v) => v.sysPromptName ?? EMPTY,
      isSet: (v) => v.sysPromptName !== undefined,
    },
    {
      key: 'eff',
      label: 'Eff',
      width: 0,
      get: (v) => v.reasoningEffort ?? EMPTY,
      isSet: (v) => v.reasoningEffort !== undefined,
    },
    {
      key: 'think',
      label: 'Think',
      width: 0,
      get: (v) =>
        v.thinkingBudgetTokens !== undefined
          ? String(v.thinkingBudgetTokens)
          : EMPTY,
      isSet: (v) => v.thinkingBudgetTokens !== undefined,
    },
  ];
  return candidates
    .filter((c) => variants.some((v) => c.isSet(v)))
    .map((c) => ({
      ...c,
      width: Math.max(c.label.length, ...variants.map((v) => c.get(v).length)),
    }));
};

export const Cell: React.FC<{
  value: string;
  width: number;
  align: 'left' | 'right';
  bold?: boolean;
  dim?: boolean;
  focused?: boolean;
}> = ({ value, width, align, bold, dim, focused }) => (
  <Box width={width} justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}>
    <Text bold={bold} dimColor={dim} inverse={focused}>
      {value}
    </Text>
  </Box>
);

export type VariantTableProps = {
  stats: Map<string, RunningStats>;
  orderedVariantNames: string[];
  variantsByName: Map<string, VariantDescriptor>;
  axisColumns: AxisColumn[];
  orderedVisibleColumns: Column[];
  /** Column-focus highlight (App browsing mode). Omitted → static table. */
  focusedColKey?: ColKey;
  /** Row cursor on a variant → highlight its identity cell. */
  focusedVariantName?: string;
  /** Row cursor on the header (aggregate scorer target) → highlight it. */
  headerFocused?: boolean;
};

export const VariantTable: React.FC<VariantTableProps> = ({
  stats,
  orderedVariantNames,
  variantsByName,
  axisColumns,
  orderedVisibleColumns,
  focusedColKey,
  focusedVariantName,
  headerFocused,
}) => (
  <Box flexDirection="column">
    <Box>
      {axisColumns.map((ac, i) => (
        <Box key={ac.key} marginLeft={i === 0 ? 0 : 2}>
          <Cell
            value={ac.label}
            width={ac.width}
            align="left"
            bold
            focused={headerFocused === true && i === 0}
          />
        </Box>
      ))}
      {orderedVisibleColumns.map((c) => (
        <Box key={c.key} marginLeft={2}>
          <Cell
            value={c.label}
            width={c.width}
            align={c.align}
            bold
            focused={focusedColKey !== undefined && c.key === focusedColKey}
          />
        </Box>
      ))}
    </Box>

    {orderedVariantNames.map((name) => {
      const rowStats = stats.get(name) ?? null;
      const variant = variantsByName.get(name);
      return (
        <Box key={name}>
          {axisColumns.map((ac, i) => (
            <Box key={ac.key} marginLeft={i === 0 ? 0 : 2}>
              <Cell
                value={variant ? ac.get(variant) : EMPTY}
                width={ac.width}
                align="left"
                focused={focusedVariantName === name && i === 0}
              />
            </Box>
          ))}
          {orderedVisibleColumns.map((c) => (
            <Box key={c.key} marginLeft={2}>
              <Cell value={c.render(rowStats)} width={c.width} align={c.align} />
            </Box>
          ))}
        </Box>
      );
    })}
    {orderedVariantNames.length === 0 && (
      <Text dimColor>(no variants match filter)</Text>
    )}
  </Box>
);
