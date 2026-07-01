import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WizardAction, WizardState } from '../store';
import type { EvalCase } from '@eval/engine/types';

export type CasesPageProps = {
  allCases: EvalCase[];
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  /** Return to the subject picker. When provided, Esc goes back; q still quits. */
  onBack?: () => void;
  onQuit: () => void;
};

const INPUT_PREVIEW_MAX = 96;

const previewInput = (input: unknown): string => {
  const s = String(input).replace(/\s+/g, ' ').trim();
  return s.length > INPUT_PREVIEW_MAX
    ? `${s.slice(0, INPUT_PREVIEW_MAX - 1)}…`
    : s;
};

export const CasesPage: React.FC<CasesPageProps> = ({
  allCases,
  state,
  dispatch,
  onNext,
  onBack,
  onQuit,
}) => {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(
    () => new Set(state.selectedCases.map((c) => c.slug)),
  );

  useInput((input, key) => {
    if (key.upArrow) {
      setFocusedIdx((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setFocusedIdx((prev) => Math.min(allCases.length - 1, prev + 1));
      return;
    }
    if (input === ' ') {
      const slug = allCases[focusedIdx].slug;
      setSelectedSlugs((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        return next;
      });
      return;
    }
    if (key.return) {
      if (selectedSlugs.size === 0) return;
      const cases = allCases.filter((c) => selectedSlugs.has(c.slug));
      dispatch({ type: 'setCases', cases });
      onNext();
      return;
    }
    if (key.escape) {
      (onBack ?? onQuit)();
      return;
    }
    if (input === 'q') {
      onQuit();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>
        Step 2/5 — Cases ({selectedSlugs.size} of {allCases.length} selected)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {allCases.map((c, idx) => {
          const isChecked = selectedSlugs.has(c.slug);
          const marker = isChecked ? '[x]' : '[ ]';
          const focused = idx === focusedIdx;
          return (
            <React.Fragment key={c.slug}>
              <Text inverse={focused} dimColor={!isChecked}>
                {`${marker} ${c.slug}  [${c.difficulty}]`}
              </Text>
              <Text dimColor>{`      "${previewInput(c.input)}"`}</Text>
            </React.Fragment>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {onBack
            ? '↑↓ nav · Space toggle · Enter next · Esc back · q quit'
            : '↑↓ nav · Space toggle · Enter next · Esc/q quit'}
        </Text>
      </Box>
    </Box>
  );
};
