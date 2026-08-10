/** What `undetermini` does when it finds no project to run.
 *
 *  Falling back to the reference subject looked harmless until the fallback was
 *  run for real from an empty directory: it started thirty trials against a paid
 *  API without asking. A first contact must not spend money, so the fallback is
 *  still there — it is just asked for now, with `--subject=example`.
 */

export const shouldShowGettingStarted = (
  projectDir: string | null,
  argv: readonly string[],
): boolean =>
  projectDir === null &&
  !argv.some((arg) => arg === '--subject' || arg.startsWith('--subject='));

export const GETTING_STARTED = `No undetermini.config.ts found in this directory or any parent.

Declare the subjects you want to evaluate, at the root of your project:

  // undetermini.config.ts
  import { defineConfig } from 'undetermini';
  import { mySubject } from './eval/my-subject';

  export default defineConfig({
    subjects: { 'my-subject': mySubject },
    defaultSubject: 'my-subject',
  });

Then run \`undetermini\` again from anywhere inside the project.

To see the harness work on its built-in example instead, run:

  undetermini --subject=example

That one calls a real model and is billed to your OPENAI_API_KEY.`;
