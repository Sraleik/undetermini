import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EvalVariant } from '@eval/engine/variant';
import { PRICING_VERIFIED_AT } from '@eval/engine/pricing';
import type { Subject } from '@eval/engine/runner-loop';
import {
  buildPlannedRuns,
  estimateRunCost,
  resolvePlannedCacheKeys,
  type RunCostEstimate,
} from '../cost-estimate';
import type { CapturedKey } from '../key-capture-middleware';
import type { WizardAction, WizardState } from '../store';

export type ConfirmPageProps = {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  /** Used to build the real prompt per (variant×case) so the cache estimate
   *  matches the runtime key exactly (no network — see resolvePlannedCacheKeys). */
  subject: Subject<EvalVariant>;
  onProceed: () => void;
  onBack: () => void;
};

const formatCostLine = (estimate: RunCostEstimate): string => {
  const dollars = `~$${estimate.estimatedCostUsd.toFixed(2)}`;
  const pricing = `pricing as of ${PRICING_VERIFIED_AT}`;
  if (estimate.modelsLackingData.length === 0) {
    return `${dollars}  (${pricing})`;
  }
  const missing = estimate.modelsLackingData.join(', ');
  if (estimate.estimatedCostUsd > 0) {
    return `${dollars} partial  (${pricing}; no data for: ${missing})`;
  }
  return `unavailable  (no historical data for: ${missing})`;
};

export const ConfirmPage: React.FC<ConfirmPageProps> = ({
  state,
  dispatch,
  subject,
  onProceed,
  onBack,
}) => {
  const [trialCountStr, setTrialCountStr] = useState(String(state.trialCount));
  const trialCount = Math.max(1, parseInt(trialCountStr || '0', 10) || 0);

  const { selectedVariants, selectedCases } = state;

  // Exact runtime cache keys per (variant×case). Resolved by building the real
  // prompts (no LLM call). Independent of trialCount, so it is NOT recomputed
  // while the user edits the trial count — only the cheap SQL re-runs.
  const [resolvedKeys, setResolvedKeys] = useState<Map<
    string,
    CapturedKey
  > | null>(null);
  const resolveSeq = useRef(0);

  useEffect(() => {
    const seq = ++resolveSeq.current;
    setResolvedKeys(null);
    void resolvePlannedCacheKeys(
      subject,
      selectedVariants,
      selectedCases,
    ).then((keys) => {
      if (resolveSeq.current === seq) setResolvedKeys(keys);
    });
  }, [subject, selectedVariants, selectedCases]);

  // Debounce trialCount so each digit doesn't fire the SQL aggregate.
  const [debouncedTrialCount, setDebouncedTrialCount] = useState(trialCount);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTrialCount(trialCount), 250);
    return () => clearTimeout(t);
  }, [trialCount]);

  const estimate = useMemo<RunCostEstimate | null>(() => {
    if (resolvedKeys === null) return null;
    const planned = buildPlannedRuns(
      selectedVariants,
      selectedCases,
      debouncedTrialCount,
      resolvedKeys,
    );
    return estimateRunCost(planned);
  }, [resolvedKeys, selectedVariants, selectedCases, debouncedTrialCount]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      if (trialCount < 1) return;
      dispatch({ type: 'setTrialCount', trialCount });
      onProceed();
      return;
    }
    if (key.backspace || key.delete) {
      setTrialCountStr((prev) => prev.slice(0, -1));
      return;
    }
    if (/^[0-9]$/.test(input)) {
      setTrialCountStr((prev) => (prev + input).slice(0, 6));
      return;
    }
  });

  const totalLine =
    estimate === null
      ? `  Total:    ${(selectedVariants.length * selectedCases.length * trialCount).toLocaleString()} runs  (computing prompts…)`
      : `  Total:    ${estimate.totalTrials.toLocaleString()} runs  (~${estimate.cachedTrials.toLocaleString()} cached + ~${estimate.freshTrials.toLocaleString()} fresh)${
          estimate.unresolvedPairs > 0
            ? `  [approx: ${estimate.unresolvedPairs} pair(s) unresolved]`
            : ''
        }`;
  const costLine =
    estimate === null
      ? '  Cost:     computing…'
      : `  Cost:     ${formatCostLine(estimate)}`;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Step 5/5 — Confirm</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text>{`  Trial count: `}</Text>
          <Text inverse>{trialCountStr || ' '}</Text>
          <Text dimColor>{`  (digits to type · Backspace to edit)`}</Text>
        </Box>
        <Text>{`  Cases:    ${selectedCases.length}`}</Text>
        <Text>{`  Variants: ${selectedVariants.length}`}</Text>
        <Text>{totalLine}</Text>
        <Text>{costLine}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter to start the run · Esc to go back</Text>
      </Box>
    </Box>
  );
};
