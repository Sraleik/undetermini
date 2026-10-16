import { loadRegistry, takeConfigFlag } from '@undetermini/application/config';
import {
  GETTING_STARTED,
  gettingStartedExitCode,
  shouldShowGettingStarted,
} from './getting-started';
import { isModelsExport, runModelsExport } from './models-export';
import { runEvalCli } from './runner';

const { configPath, rest } = takeConfigFlag(process.argv.slice(2));

// The export reads and writes the project's files: it must not load the config
// it is about to rewrite (a config without `models` would even warn).
if (isModelsExport(rest)) {
  process.exit(runModelsExport({ configPath, cwd: process.cwd() }));
}

// Run from the project root, like vitest does: a subject declares its prompts
// and cases relative to it, not to the caller's shell.
loadRegistry(configPath, process.cwd(), {
  chdirToProject: true,
  loadEnv: true,
})
  .then(({ registry, projectDir }) => {
    if (shouldShowGettingStarted(projectDir, rest)) {
      console.log(GETTING_STARTED);
      process.exitCode = gettingStartedExitCode(rest);
      return;
    }
    return runEvalCli(registry, rest);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
