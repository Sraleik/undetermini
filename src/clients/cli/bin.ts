import { runEvalCli } from './runner';

runEvalCli().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
