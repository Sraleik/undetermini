import { runEvalTui } from './runner';

runEvalTui().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
