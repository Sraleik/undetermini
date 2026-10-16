import type { SchemaAxisValue, SysPromptAxisValue } from '@undetermini/core/axes/axis-inputs';
import type { ModelAxisInputs } from '@undetermini/core/models/expand';
import { modelKey, type Model } from '@undetermini/core/models/model';
import { resolveSysPrompts } from '@undetermini/application/axes/resolve-sys-prompts';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';
import type {
  RegisteredPrompt,
  RegisteredSchema,
} from '@undetermini/application/subjects/registry';
import { PROMPT_KIND } from '@undetermini/application/subjects/registry';
import { buildModelEntries, declaredSettingNames } from '../axis-settings';
import { cycleListIndex } from '../cycle-index';
import type { WizardAction, WizardState } from '../store';

type SectionKey = 'models' | 'settings' | 'sysPrompts' | 'schemas';

export type AxesPageProps = {
  /** The models the project declares (`registry.models`): the only ones offered. */
  models: ReadonlyArray<Model>;
  /** The selected subject's prompt-variant library (registry `promptsDir`).
   *  When undefined the subject has no prompt lineage, so the selector offers
   *  only `default (baseline)` — no other subject's baselines leak in. */
  promptsDir?: string;
  /** The selected subject's name. The prompt selector lists only THIS subject's
   *  filenames. */
  /** This subject's prompt library — the selector lists these and nothing
   *  else, so no other subject's lineage can appear (DEV-2808). */
  prompts: readonly RegisteredPrompt[];
  /** This subject's schema library. */
  schemas: readonly RegisteredSchema<unknown>[];
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  onBack: () => void;
};

/** Parse the generation number from a prompt name (`v17-baseline`,
 *  `gate-v8-baseline`, `v14-fix-bug-doublon-v1`). */
const generationOf = (name: string): number =>
  Number(/v(\d+)/.exec(name)?.[1] ?? -1);

/**
 * The prompt tokens offered in the selector for a subject, sourced from the
 * subject's own declared list (never a filename scan). Shows every baseline plus
 * the iterations of the CURRENT (highest-generation) baseline only — older
 * generations' iterations stay hidden but remain runnable via CLI `--sys-prompts`.
 */
const subjectPromptTokens = (
  forSubject: readonly RegisteredPrompt[],
): string[] => {
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

export const AxesPage: React.FC<AxesPageProps> = ({
  models,
  promptsDir,
  prompts,
  schemas,
  state,
  dispatch,
  onNext,
  onBack,
}) => {
  const sysPromptChoices = useMemo(
    () => subjectPromptTokens(prompts),
    [prompts],
  );
  // Schema-axis choices come from the subject's own library — same anti-leak
  // discipline as prompts, now structural rather than filtered. Names and
  // display labels are built once here, not re-derived per render.
  const schemaChoices = useMemo(
    () =>
      schemas.map((s) => ({
        name: s.name,
        label: `${s.name}  (${s.description})`,
      })),
    [schemas],
  );

  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    () => new Set(state.axes.models.map(({ model }) => modelKey(model))),
  );
  const [selectedSettings, setSelectedSettings] = useState<Set<string>>(() => {
    const names = state.axes.models.flatMap((entry) => entry.settingNames);
    return new Set(names.length > 0 ? names : ['default']);
  });
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

  const chosenModels = useMemo(
    () => models.filter((model) => selectedModels.has(modelKey(model))),
    [models, selectedModels],
  );
  const settingChoices = useMemo(
    () => declaredSettingNames(chosenModels),
    [chosenModels],
  );

  const activeSections = useMemo<SectionKey[]>(() => {
    const list: SectionKey[] = ['models'];
    if (settingChoices.length > 0) list.push('settings');
    list.push('sysPrompts');
    if (schemaChoices.length > 0) list.push('schemas');
    return list;
  }, [settingChoices, schemaChoices]);

  const [focusSection, setFocusSection] = useState(0);
  const [focusItem, setFocusItem] = useState(0);

  // Items count per section — used for ↑↓ wrap and focus reset on Tab.
  const itemCount = (section: SectionKey): number => {
    switch (section) {
      case 'models':
        return models.length;
      case 'settings':
        return settingChoices.length + 1;
      case 'sysPrompts':
        return sysPromptChoices.length + 1;
      case 'schemas':
        return schemaChoices.length + 1;
    }
  };

  const currentSection =
    activeSections[Math.min(focusSection, activeSections.length - 1)];

  const toggleIn = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string,
  ): void => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleAt = (section: SectionKey, idx: number): void => {
    if (section === 'models') {
      toggleIn(setSelectedModels, modelKey(models[idx]));
    } else if (section === 'settings') {
      toggleIn(setSelectedSettings, idx === 0 ? 'default' : settingChoices[idx - 1]);
    } else if (section === 'sysPrompts') {
      toggleIn(setSelectedSysPrompts, idx === 0 ? 'default' : sysPromptChoices[idx - 1]);
    } else {
      toggleIn(setSelectedSchemas, idx === 0 ? 'default' : schemaChoices[idx - 1].name);
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
      const axes: ModelAxisInputs<unknown> = {
        models: buildModelEntries(chosenModels, selectedSettings),
        sysPrompts: sysPrompts.length > 0 ? sysPrompts : ['default'],
        schemas: schemas.length > 0 ? schemas : ['default'],
      };
      dispatch({ type: 'setAxes', axes });
      onNext();
    }
  });

  const renderSection = (section: SectionKey) => {
    const isActive = section === currentSection;
    const titlePrefix = isActive ? '▶ ' : '  ';
    return (
      <Box key={section} flexDirection="column" marginBottom={1}>
        <Text bold color={isActive ? 'cyan' : undefined}>
          {titlePrefix}
          {sectionTitle(section)}
        </Text>
        {section === 'models' &&
          renderModelsItems(models, selectedModels, isActive ? focusItem : -1)}
        {section === 'settings' &&
          renderSimpleItems(
            ['default (no setting)', ...settingChoices],
            (i) =>
              i === 0
                ? selectedSettings.has('default')
                : selectedSettings.has(settingChoices[i - 1]),
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
        {activeSections.map((section) => renderSection(section))}
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
    case 'settings':
      return 'Réglages du modèle';
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

const modelNotes = (model: Model): string => {
  const notes = [model.provider];
  if (model.retired === true) notes.push('retired');
  if (model.price.length === 0) notes.push('prix inconnu');
  return notes.join(', ');
};

const renderModelsItems = (
  models: ReadonlyArray<Model>,
  selected: Set<string>,
  focusedIdx: number,
): React.ReactNode => (
  <>
    {models.map((model, idx) => {
      const key = modelKey(model);
      const checked = selected.has(key);
      const focused = idx === focusedIdx;
      return (
        <Text key={key} inverse={focused} dimColor={!checked}>
          {`  ${checked ? '[x]' : '[ ]'} ${model.id}  (${modelNotes(model)})`}
        </Text>
      );
    })}
  </>
);
