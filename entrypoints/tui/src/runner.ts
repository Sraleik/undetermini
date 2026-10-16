import React from 'react';
import { render } from 'ink';
import { parseEvalArgs } from '@undetermini/cli/cli-args';
import { writeRunToDb } from '@undetermini/application/storage/write';
import {
  defaultRegistry,
  resolveIn,
  type RegisteredSubject,
  type SubjectRegistry,
} from '@undetermini/application/subjects/registry';
import { Router } from './Router';
import { loadPrefs, savePrefs } from './prefs';
import type { WizardState } from './store';

/** Run the eval TUI against a host's subject registry. See `runEvalCli`. */
export const runEvalTui = async (
  registry: SubjectRegistry = defaultRegistry,
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const catalog = registry.models;
  const args = parseEvalArgs(argv, catalog);

  // Validate `--subject` (throws on an unknown name) and use it as the launch
  // selection; the SubjectPage lets the user switch among SUBJECTS at runtime.
  const initialSubjectName = args.subject ?? registry.defaultSubject;
  const { subject } = resolveIn(registry, initialSubjectName);

  if (args.caseSlugs && subject.cases.length > 0) {
    const knownSlugs = new Set(subject.cases.map((c) => c.slug));
    const unmatched = args.caseSlugs.filter((s) => !knownSlugs.has(s));
    if (unmatched.length === args.caseSlugs.length) {
      throw new Error(
        `--case-slugs=${args.caseSlugs.join(',')} matched 0 cases. Available slugs: ${subject.cases.map((c) => c.slug).join(', ')}`,
      );
    }
  }

  const savedDisplay = loadPrefs();
  const sectionsFromCli = argv.some(
    (a) => a === '--sections' || a.startsWith('--sections='),
  );

  // Clear screen + scrollback once before Ink takes over, so the TUI starts
  // at the top of an empty terminal and uses the full available height.
  // Safe here (pre-render): the documented race is only with a mid-render
  // manual clear fighting Ink's throttled writer — Ink hasn't drawn yet.
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  }

  await new Promise<void>((resolve) => {
    const inkApp = render(
      React.createElement(Router, {
        subjects: registry.subjects,
        initialSubjectName,
        args,
        catalog,
        onRunFinished: (state: WizardState, registered: RegisteredSubject) => {
          if (state.runResult === null) return;
          writeRunToDb({
            subjectName: registered.subject.name,
            evalFile: registered.evalFile,
            casesDir: registered.casesDir,
            run: state.runResult,
            catalog,
          });
        },
        onQuit: () => {
          inkApp.unmount();
        },
        savedDisplay,
        sectionsFromCli,
        onCommitDisplay: savePrefs,
      }),
    );
    inkApp.waitUntilExit().then(() => resolve());
  });
};


