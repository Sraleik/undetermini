import { loadRegistry, takeConfigFlag } from '@eval/config';
import { runEvalCli } from './runner';

const { configPath, rest } = takeConfigFlag(process.argv.slice(2));

// Run from the project root, like vitest does: a subject declares its prompts
// and cases relative to it, not to the caller's shell.
loadRegistry(configPath, process.cwd(), {
  chdirToProject: true,
  loadEnv: true,
})
  .then(({ registry }) => runEvalCli(registry, rest))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
