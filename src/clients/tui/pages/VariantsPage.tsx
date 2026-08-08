import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { cycleListIndex } from '../cycle-index';
import { expandCartesianDetailed } from '@eval/engine/axes/expand-cartesian';
import type { DroppedCombo } from '@eval/engine/axes/expand-cartesian';
import type { WizardAction, WizardState } from '../store';

/** Capability-matrix skips, rendered where the combos would have appeared —
 *  a model can vanish entirely here (gpt-4.1 with only `minimal` checked,
 *  2026-07-10), so the page must say WHY instead of staying silent. */
const DroppedCombos: React.FC<{ dropped: DroppedCombo[] }> = ({ dropped }) =>
  dropped.length === 0 ? null : (
    <Box flexDirection="column">
      {dropped.map((d) => (
        <Text key={`${d.modelId}|${d.axis}|${d.value}`} color="yellow" dimColor>
          {`  ⚠ dropped: ${d.modelId} × ${d.axis}-${d.value}  (${d.reason})`}
        </Text>
      ))}
    </Box>
  );

export type VariantsPageProps = {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  onBack: () => void;
};

export const VariantsPage: React.FC<VariantsPageProps> = ({
  state,
  dispatch,
  onNext,
  onBack,
}) => {
  const { variants: allVariants, dropped } = useMemo(
    () => expandCartesianDetailed(state.axes),
    [state.axes],
  );

  const [focusIdx, setFocusIdx] = useState(0);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => {
    if (state.selectedVariants.length > 0) {
      return new Set(state.selectedVariants.map((v) => v.name));
    }
    // First entry into the page — pre-check every cartesian variant.
    return new Set(allVariants.map((v) => v.name));
  });

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) {
      setFocusIdx((prev) => cycleListIndex(prev, -1, allVariants.length));
      return;
    }
    if (key.downArrow) {
      setFocusIdx((prev) => cycleListIndex(prev, 1, allVariants.length));
      return;
    }
    if (input === ' ') {
      const name = allVariants[focusIdx].name;
      setSelectedNames((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
      return;
    }
    if (input === 'a') {
      setSelectedNames(new Set(allVariants.map((v) => v.name)));
      return;
    }
    if (input === 'n') {
      setSelectedNames(new Set());
      return;
    }
    if (key.return) {
      if (selectedNames.size === 0) return;
      const variants = allVariants.filter((v) => selectedNames.has(v.name));
      dispatch({ type: 'setSelectedVariants', variants });
      onNext();
    }
  });

  if (allVariants.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">
          Cartesian expansion produced 0 variants. Esc to revisit axes.
        </Text>
        <DroppedCombos dropped={dropped} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>
        Step 4/5 — Variants ({selectedNames.size} of {allVariants.length}{' '}
        selected)
      </Text>
      <Text dimColor>Cartesian expansion of axes — uncheck unwanted combos.</Text>
      <DroppedCombos dropped={dropped} />
      <Box marginTop={1} flexDirection="column">
        {allVariants.map((v, idx) => {
          const checked = selectedNames.has(v.name);
          const focused = idx === focusIdx;
          return (
            <Text key={v.name} inverse={focused} dimColor={!checked}>
              {`  ${checked ? '[x]' : '[ ]'} ${v.name}`}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ nav · Space toggle · a all · n none · Enter next · Esc back
        </Text>
      </Box>
    </Box>
  );
};
