import { loadRegistry, takeConfigFlag } from '@eval/config';
import { GETTING_STARTED, shouldShowGettingStarted } from './getting-started';
import { runEvalCli } from './runner';

const { configPath, rest } = takeConfigFlag(process.argv.slice(2));

// Run from the project root, like vitest does: a subject declares its prompts
// and cases relative to it, not to the caller's shell.
loadRegistry(configPath, process.cwd(), {
  chdirToProject: true,
  loadEnv: true,
})
  .then(({ registry, projectDir }) => {
    if (shouldShowGettingStarted(projectDir, rest)) {
      console.log(GETTING_STARTED);
      return;
    }
    return runEvalCli(registry, rest);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
