import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { existsSync, readdirSync } from 'node:fs';
import type { EvalVariant } from '@eval/engine/variant';
import {
  MODEL_CAPABILITIES,
  supportsThinkingBudget,
} from '@eval/engine/axes/model-capabilities';
import type {
  AxisInputs,
  AxisModelEntry,
  ReasoningEffortValue,
  SysPromptAxisValue,
} from '@eval/engine/axes/axis-inputs';
import { resolveSysPrompts } from '@eval/engine/axes/resolve-sys-prompts';
import type { WizardAction, WizardState } from '../store';

const PROMPTS_DIR = 'eval/prompts';
const REASONING_EFFORT_CHOICES: ReadonlyArray<ReasoningEffortValue> = [
  'minimal',
  'low',
  'medium',
  'high',
];
const COMMON_THINKING_BUDGETS = [4096, 8192, 16384, 32768] as const;

type SectionKey = 'models' | 'efforts' | 'budgets' | 'sysPrompts';

export type AxesPageProps = {
  subjectVariants: ReadonlyArray<EvalVariant>;
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  onBack: () => void;
};

const modelKey = (m: { provider: string; modelId: string }): string =>
  `${m.provider}:${m.modelId}`;

const scanPromptsDir = (): string[] => {
  if (!existsSync(PROMPTS_DIR)) return [];
  return readdirSync(PROMPTS_DIR)
    // Show only the pure baselines (`vN-baseline.md`) in the wizard. Every other
    // file in eval/prompts/ is a dev experiment (axis iterations like
    // `vN-<axis>-vM.md`, `gate-v6-*`, plus the PROMPT-BUDGET doc) — still
    // runnable via the CLI `--sys-prompts`, just hidden here to keep the
    // selector uncluttered for the nl-filter lineage.
    .filter((f) => /^v\d+-baseline\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''));
};

const deriveModelChoices = (
  subjectVariants: ReadonlyArray<EvalVariant>,
): { entry: AxisModelEntry; isInSubject: boolean }[] => {
  const seen = new Set<string>();
  const choices: { entry: AxisModelEntry; isInSubject: boolean }[] = [];
  const subjectKeys = new Set(subjectVariants.map((v) => modelKey(v)));
  for (const variant of subjectVariants) {
    const key = modelKey(variant);
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({
      entry: { provider: variant.provider, modelId: variant.modelId },
      isInSubject: true,
    });
  }
  for (const [modelId, capability] of Object.entries(MODEL_CAPABILITIES)) {
    const key = `${capability.provider}:${modelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({
      entry: { provider: capability.provider, modelId },
      isInSubject: subjectKeys.has(key),
    });
  }
  return choices;
};

export const AxesPage: React.FC<AxesPageProps> = ({
  subjectVariants,
  state,
  dispatch,
  onNext,
  onBack,
}) => {
  const modelChoices = useMemo(
    () => deriveModelChoices(subjectVariants),
    [subjectVariants],
  );
  const sysPromptChoices = useMemo(() => scanPromptsDir(), []);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set(state.axes.models.map((m) => modelKey(m))),
  );
  const [selectedEfforts, setSelectedEfforts] = useState<
    Set<ReasoningEffortValue | 'default'>
  >(() => new Set(state.axes.reasoningEfforts));
  const [selectedBudgets, setSelectedBudgets] = useState<Set<number | 'default'>>(
    () => new Set(state.axes.thinkingBudgets),
  );
  const [selectedSysPrompts, setSelectedSysPrompts] = useState<Set<string>>(
    () =>
      new Set(
        state.axes.sysPrompts.map((s) => (s === 'default' ? 'default' : s.name)),
      ),
  );

  const activeSections = useMemo<SectionKey[]>(() => {
    const list: SectionKey[] = ['models'];
    const hasReasoning = [...selectedModels].some((key) => {
      const [, modelId] = key.split(':');
      const cap = MODEL_CAPABILITIES[modelId];
      return cap?.provider === 'openai' && (cap.reasoningEffort?.length ?? 0) > 0;
    });
    if (hasReasoning) list.push('efforts');
    const hasThinking = [...selectedModels].some((key) => {
      const [provider, modelId] = key.split(':');
      return provider === 'anthropic' && supportsThinkingBudget(modelId);
    });
    if (hasThinking) list.push('budgets');
    list.push('sysPrompts');
    return list;
  }, [selectedModels]);

  const [focusSection, setFocusSection] = useState(0);
  const [focusItem, setFocusItem] = useState(0);

  // Items count per section — used for ↑↓ wrap and focus reset on Tab.
  const itemCount = (section: SectionKey): number => {
    switch (section) {
      case 'models':
        return modelChoices.length;
      case 'efforts':
        return REASONING_EFFORT_CHOICES.length + 1;
      case 'budgets':
        return COMMON_THINKING_BUDGETS.length + 1;
      case 'sysPrompts':
        return sysPromptChoices.length + 1;
    }
  };

  const currentSection = activeSections[Math.min(focusSection, activeSections.length - 1)];

  const toggleAt = (section: SectionKey, idx: number): void => {
    if (section === 'models') {
      const key = modelKey(modelChoices[idx].entry);
      setSelectedModels((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else if (section === 'efforts') {
      const value: ReasoningEffortValue | 'default' =
        idx === 0 ? 'default' : REASONING_EFFORT_CHOICES[idx - 1];
      setSelectedEfforts((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    } else if (section === 'budgets') {
      const value: number | 'default' =
        idx === 0 ? 'default' : COMMON_THINKING_BUDGETS[idx - 1];
      setSelectedBudgets((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    } else {
      const value: string =
        idx === 0 ? 'default' : sysPromptChoices[idx - 1];
      setSelectedSysPrompts((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.tab) {
      setFocusSection((prev) => {
        const direction = key.shift ? -1 : 1;
        const len = activeSections.length;
        return (prev + direction + len) % len;
      });
      setFocusItem(0);
      return;
    }
    if (key.upArrow) {
      setFocusItem((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      const max = itemCount(currentSection) - 1;
      setFocusItem((prev) => Math.min(max, prev + 1));
      return;
    }
    if (input === ' ') {
      toggleAt(currentSection, focusItem);
      return;
    }
    if (key.return) {
      if (selectedModels.size === 0) return;
      // Ensure each axis carries at least one value (default if empty).
      const efforts: ReadonlyArray<ReasoningEffortValue | 'default'> =
        selectedEfforts.size > 0 ? [...selectedEfforts] : ['default'];
      const budgets: ReadonlyArray<number | 'default'> =
        selectedBudgets.size > 0 ? [...selectedBudgets] : ['default'];
      // Resolve each selected prompt to its real text by reading
      // eval/prompts/<name>.md — the SAME resolver the CLI uses, so a sysPrompt
      // produces an identical variant_config / cache key in both clients.
      const sysPrompts: SysPromptAxisValue[] = resolveSysPrompts([
        ...selectedSysPrompts,
      ]);
      const axes: AxisInputs = {
        models: modelChoices
          .filter((c) => selectedModels.has(modelKey(c.entry)))
          .map((c) => c.entry),
        reasoningEfforts: efforts,
        thinkingBudgets: budgets,
        sysPrompts: sysPrompts.length > 0 ? sysPrompts : ['default'],
      };
      dispatch({ type: 'setAxes', axes });
      onNext();
    }
  });

  const renderSection = (section: SectionKey, idx: number) => {
    const isActive = section === currentSection;
    const titlePrefix = isActive ? '▶ ' : '  ';
    return (
      <Box key={section} flexDirection="column" marginBottom={1}>
        <Text bold color={isActive ? 'cyan' : undefined}>
          {titlePrefix}
          {sectionTitle(section)}
        </Text>
        {section === 'models' && renderModelsItems(modelChoices, selectedModels, isActive ? focusItem : -1)}
        {section === 'efforts' &&
          renderSimpleItems(
            ['default (unset)', ...REASONING_EFFORT_CHOICES],
            (i) => (i === 0 ? selectedEfforts.has('default') : selectedEfforts.has(REASONING_EFFORT_CHOICES[i - 1])),
            isActive ? focusItem : -1,
          )}
        {section === 'budgets' &&
          renderSimpleItems(
            ['default (no extended thinking)', ...COMMON_THINKING_BUDGETS.map((b) => `${b} tokens`)],
            (i) => (i === 0 ? selectedBudgets.has('default') : selectedBudgets.has(COMMON_THINKING_BUDGETS[i - 1])),
            isActive ? focusItem : -1,
          )}
        {section === 'sysPrompts' &&
          renderSimpleItems(
            ['default (baseline)', ...sysPromptChoices.map((n) => `${n}  (${PROMPTS_DIR}/${n}.md)`)],
            (i) => (i === 0 ? selectedSysPrompts.has('default') : selectedSysPrompts.has(sysPromptChoices[i - 1])),
            isActive ? focusItem : -1,
          )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Step 3/5 — Axes (Tab between sections)</Text>
      <Box marginTop={1} flexDirection="column">
        {activeSections.map((section, idx) => renderSection(section, idx))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Tab section · ↑↓ item · Space toggle · Enter next · Esc back
        </Text>
      </Box>
    </Box>
  );
};

const sectionTitle = (section: SectionKey): string => {
  switch (section) {
    case 'models':
      return 'Models';
    case 'efforts':
      return 'Reasoning effort (openai reasoning)';
    case 'budgets':
      return 'Thinking budget (anthropic adaptive)';
    case 'sysPrompts':
      return 'System prompts';
  }
};

const renderSimpleItems = (
  labels: string[],
  isChecked: (idx: number) => boolean,
  focusedIdx: number,
): React.ReactNode => (
  <>
    {labels.map((label, idx) => {
      const checked = isChecked(idx);
      const focused = idx === focusedIdx;
      return (
        <Text key={label} inverse={focused} dimColor={!checked}>
          {`  ${checked ? '[x]' : '[ ]'} ${label}`}
        </Text>
      );
    })}
  </>
);

const renderModelsItems = (
  choices: { entry: AxisModelEntry; isInSubject: boolean }[],
  selected: Set<string>,
  focusedIdx: number,
): React.ReactNode => (
  <>
    {choices.map((c, idx) => {
      const key = modelKey(c.entry);
      const checked = selected.has(key);
      const focused = idx === focusedIdx;
      const suffix = c.isInSubject ? '' : ', not in subject.variants';
      return (
        <Text key={key} inverse={focused} dimColor={!checked}>
          {`  ${checked ? '[x]' : '[ ]'} ${c.entry.modelId}  (${c.entry.provider}${suffix})`}
        </Text>
      );
    })}
  </>
);
