import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { parseEvalArgs } from '@eval/clients/cli/cli-args';
import { writeRunToDb } from '@eval/engine/storage/write';
import {
  resolveSubject,
  DEFAULT_SUBJECT,
  SUBJECTS,
  type RegisteredSubject,
} from '@eval/subjects/registry';
import { Router } from './Router';
import { loadPrefs, savePrefs } from './prefs';
import type { WizardState } from './store';

const main = async (): Promise<void> => {
  const args = parseEvalArgs();

  // Validate `--subject` (throws on an unknown name) and use it as the launch
  // selection; the SubjectPage lets the user switch among SUBJECTS at runtime.
  const initialSubjectName = args.subject ?? DEFAULT_SUBJECT;
  const { subject } = resolveSubject(initialSubjectName);

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
  const sectionsFromCli = process.argv.some(
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
        // The Router owns subject selection (SubjectPage); it casts each
        // registered subject to the talent `EvalVariant` shape at its own
        // boundary. The CLI runner is the fully generic path.
        subjects: SUBJECTS,
        initialSubjectName,
        args,
        onRunFinished: (state: WizardState, registered: RegisteredSubject) => {
          if (state.runResult === null) return;
          writeRunToDb({
            subjectName: registered.subject.name,
            evalFile: registered.evalFile,
            casesDir: registered.casesDir,
            run: state.runResult,
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

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
