import type { EvalVariant } from '@eval/engine/variant';
import type {
  AxisInputs,
  AxisModelEntry,
  ReasoningEffortValue,
  SchemaAxisValue,
  SysPromptAxisValue,
} from '@eval/engine/axes/axis-inputs';
import {
  MODEL_CAPABILITIES,
  supportsThinkingBudget,
} from '@eval/engine/axes/model-capabilities';
import { resolveSysPrompts } from '@eval/engine/axes/resolve-sys-prompts';
import {
  PROMPT_KIND,
  REGISTERED_PROMPTS,
} from '@eval/subjects/registered-prompts';
import { REGISTERED_SCHEMAS } from '@eval/subjects/registered-schemas';
import type { SubjectName } from '@eval/subjects/registry';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';
import { cycleListIndex } from '../cycle-index';
import type { WizardAction, WizardState } from '../store';

const REASONING_EFFORT_CHOICES: ReadonlyArray<ReasoningEffortValue> = [
  'minimal',
  'low',
  'medium',
  'high',
];
const COMMON_THINKING_BUDGETS = [4096, 8192, 16384, 32768] as const;

type SectionKey = 'models' | 'efforts' | 'budgets' | 'sysPrompts' | 'schemas';

export type AxesPageProps = {
  subjectVariants: ReadonlyArray<EvalVariant>;
  /** The selected subject's prompt-variant library (registry `promptsDir`).
   *  When undefined the subject has no prompt lineage, so the selector offers
   *  only `default (baseline)` — no other subject's baselines leak in. */
  promptsDir?: string;
  /** The selected subject's name. The prompt selector lists only THIS subject's
   *  prompts from `REGISTERED_PROMPTS` (by declared `subject`), never by scanning
   *  filenames — so no other subject's lineage can leak in (DEV-2808). */
  subjectName: SubjectName;
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  onBack: () => void;
};

const modelKey = (m: { provider: string; modelId: string }): string =>
  `${m.provider}:${m.modelId}`;

/** Parse the generation number from a prompt name (`v17-baseline`,
 *  `gate-v8-baseline`, `v14-fix-bug-doublon-v1`). */
const generationOf = (name: string): number =>
  Number(/v(\d+)/.exec(name)?.[1] ?? -1);

/**
 * The prompt tokens offered in the selector for a subject, sourced from the
 * declared `REGISTERED_PROMPTS` (never a filename scan). Shows every baseline plus
 * the iterations of the CURRENT (highest-generation) baseline only — older
 * generations' iterations stay hidden but remain runnable via CLI `--sys-prompts`.
 */
const subjectPromptTokens = (subjectName: SubjectName): string[] => {
  const forSubject = REGISTERED_PROMPTS.filter(
    (prompt) => prompt.subject === subjectName,
  );
  const baselines = forSubject
    .filter((prompt) => prompt.kind === PROMPT_KIND.BASELINE)
    .sort(
      (first, second) => generationOf(second.name) - generationOf(first.name),
    );
  const currentBaseline = baselines[0];
  // Fermeture TRANSITIVE : les itérations se chaînent (v2 iteratesOn v1, v3
  // iteratesOn v2…) — ne montrer que les enfants directs cachait toute la
  // chaîne sco-* du sélecteur (constat 2026-07-24).
  const visible = new Set(
    currentBaseline === undefined ? [] : [currentBaseline.name],
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const prompt of forSubject) {
      if (
        prompt.kind === PROMPT_KIND.ITERATION &&
        !visible.has(prompt.name) &&
        visible.has(prompt.iteratesOn)
      ) {
        visible.add(prompt.name);
        grew = true;
      }
    }
  }
  const iterations = forSubject.filter(
    (prompt) => prompt.kind === PROMPT_KIND.ITERATION && visible.has(prompt.name),
  );
  return [...baselines, ...iterations].map((prompt) => prompt.name);
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
  promptsDir,
  subjectName,
  state,
  dispatch,
  onNext,
  onBack,
}) => {
  const modelChoices = useMemo(
    () => deriveModelChoices(subjectVariants),
    [subjectVariants],
  );
  const sysPromptChoices = useMemo(
    () => subjectPromptTokens(subjectName),
    [subjectName],
  );
  // Schema-axis choices: declared REGISTERED_SCHEMAS only (never a scan),
  // filtered to this subject — same anti-leak discipline as prompts. Names and
  // display labels are built once here, not re-derived per render.
  const schemaChoices = useMemo(
    () =>
      REGISTERED_SCHEMAS.filter((s) => s.subjects.includes(subjectName)).map(
        (s) => ({ name: s.name, label: `${s.name}  (${s.description})` }),
      ),
    [subjectName],
  );

  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set(state.axes.models.map((m) => modelKey(m))),
  );
  const [selectedEfforts, setSelectedEfforts] = useState<
    Set<ReasoningEffortValue | 'default'>
  >(() => new Set(state.axes.reasoningEfforts));
  const [selectedBudgets, setSelectedBudgets] = useState<
    Set<number | 'default'>
  >(() => new Set(state.axes.thinkingBudgets));
  const [selectedSysPrompts, setSelectedSysPrompts] = useState<Set<string>>(
    () =>
      new Set(
        state.axes.sysPrompts.map((s) =>
          s === 'default' ? 'default' : s.name,
        ),
      ),
  );
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(
    () =>
      new Set(
        state.axes.schemas.map((s) => (s === 'default' ? 'default' : s.name)),
      ),
  );

  const activeSections = useMemo<SectionKey[]>(() => {
    const list: SectionKey[] = ['models'];
    const hasReasoning = [...selectedModels].some((key) => {
      const [, modelId] = key.split(':');
      const cap = MODEL_CAPABILITIES[modelId];
      return (
        cap?.provider === 'openai' && (cap.reasoningEffort?.length ?? 0) > 0
      );
    });
    if (hasReasoning) list.push('efforts');
    const hasThinking = [...selectedModels].some((key) => {
      const [provider, modelId] = key.split(':');
      return provider === 'anthropic' && supportsThinkingBudget(modelId);
    });
    if (hasThinking) list.push('budgets');
    list.push('sysPrompts');
    if (schemaChoices.length > 0) list.push('schemas');
    return list;
  }, [selectedModels, schemaChoices]);

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
      case 'schemas':
        return schemaChoices.length + 1;
    }
  };

  const currentSection =
    activeSections[Math.min(focusSection, activeSections.length - 1)];

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
    } else if (section === 'sysPrompts') {
      const value: string =
        idx === 0 ? 'default' : sysPromptChoices[idx - 1];
      setSelectedSysPrompts((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    } else {
      const value: string = idx === 0 ? 'default' : schemaChoices[idx - 1].name;
      setSelectedSchemas((prev) => {
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
      setFocusItem((prev) =>
        cycleListIndex(prev, -1, itemCount(currentSection)),
      );
      return;
    }
    if (key.downArrow) {
      setFocusItem((prev) =>
        cycleListIndex(prev, 1, itemCount(currentSection)),
      );
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
      // <promptsDir>/<name>.md — the SAME resolver the CLI uses, so a sysPrompt
      // produces an identical variant_config / cache key in both clients.
      const sysPrompts: SysPromptAxisValue[] = resolveSysPrompts(
        [...selectedSysPrompts],
        promptsDir,
      );
      const schemas: SchemaAxisValue[] = [...selectedSchemas].map((name) =>
        name === 'default' ? 'default' : { name },
      );
      const axes: AxisInputs = {
        models: modelChoices
          .filter((c) => selectedModels.has(modelKey(c.entry)))
          .map((c) => c.entry),
        reasoningEfforts: efforts,
        thinkingBudgets: budgets,
        sysPrompts: sysPrompts.length > 0 ? sysPrompts : ['default'],
        schemas: schemas.length > 0 ? schemas : ['default'],
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
        {section === 'models' &&
          renderModelsItems(
            modelChoices,
            selectedModels,
            isActive ? focusItem : -1,
          )}
        {section === 'efforts' &&
          renderSimpleItems(
            ['default (unset)', ...REASONING_EFFORT_CHOICES],
            (i) =>
              i === 0
                ? selectedEfforts.has('default')
                : selectedEfforts.has(REASONING_EFFORT_CHOICES[i - 1]),
            isActive ? focusItem : -1,
          )}
        {section === 'budgets' &&
          renderSimpleItems(
            [
              'default (no extended thinking)',
              ...COMMON_THINKING_BUDGETS.map((b) => `${b} tokens`),
            ],
            (i) =>
              i === 0
                ? selectedBudgets.has('default')
                : selectedBudgets.has(COMMON_THINKING_BUDGETS[i - 1]),
            isActive ? focusItem : -1,
          )}
        {section === 'sysPrompts' &&
          renderSimpleItems(
            [
              'default (baseline)',
              ...sysPromptChoices.map((n) => `${n}  (${promptsDir}/${n}.md)`),
            ],
            (i) =>
              i === 0
                ? selectedSysPrompts.has('default')
                : selectedSysPrompts.has(sysPromptChoices[i - 1]),
            isActive ? focusItem : -1,
          )}
        {section === 'schemas' &&
          renderSimpleItems(
            ['default (live prod schema)', ...schemaChoices.map((c) => c.label)],
            (i) => (i === 0 ? selectedSchemas.has('default') : selectedSchemas.has(schemaChoices[i - 1].name)),
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
    case 'schemas':
      return 'Extraction schemas';
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
