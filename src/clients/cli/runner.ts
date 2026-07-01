import 'dotenv/config';
import { expandCartesian } from '@eval/engine/axes/expand-cartesian';
import { resolveSysPrompts } from '@eval/engine/axes/resolve-sys-prompts';
import { EvalEngine } from '@eval/engine/api';
import { parseEvalArgs } from './cli-args';
import { subscribeConsolePrinter } from './console-printer';
import { readGitState } from '@eval/engine/git-state';
import { writeRunToDb } from '@eval/engine/storage/write';
import { resolveSubject, DEFAULT_SUBJECT } from '@eval/subjects/registry';

const main = async (): Promise<void> => {
  const args = parseEvalArgs();

  const {
    subject: evalSubject,
    evalFile,
    casesDir,
  } = resolveSubject(args.subject ?? DEFAULT_SUBJECT);

  let subjectCases = evalSubject.cases;
  let subjectVariants: typeof evalSubject.variants = evalSubject.variants;

  if (args.caseSlugs) {
    subjectCases = evalSubject.cases.filter((c) =>
      args.caseSlugs!.includes(c.slug),
    );
    if (subjectCases.length === 0) {
      throw new Error(
        `--case-slugs=${args.caseSlugs.join(',')} matched 0 cases. Available slugs: ${evalSubject.cases.map((c) => c.slug).join(', ')}`,
      );
    }
  }

  if (args.cartesian) {
    const sysPrompts = resolveSysPrompts(args.cartesian.sysPromptTokens);
    const variants = expandCartesian({
      models: args.cartesian.models,
      reasoningEfforts: args.cartesian.reasoningEfforts,
      thinkingBudgets: args.cartesian.thinkingBudgets,
      sysPrompts,
    });
    if (variants.length === 0) {
      throw new Error(
        `Cartesian expansion produced 0 valid variants — every (model, axis) combo was filtered out by the capability matrix. Check your --models / --reasoning-efforts / --thinking-budgets values against eval/axes/model-capabilities.ts.`,
      );
    }
    subjectVariants = variants;
  }

  const subject = {
    ...evalSubject,
    cases: subjectCases,
    variants: subjectVariants,
  };

  const startedAt = new Date().toISOString();
  const git = readGitState();
  const runId = `${startedAt.replace(/[:.]/g, '-')}__${git.sha.slice(0, 7)}`;

  console.log(
    `[eval] subject=${subject.name} mode=${args.cacheMode} trials=${args.trialCount} cases=${subject.cases.length} variants=${subject.variants.length} concurrency=${args.maxConcurrency}`,
  );

  const meta = {
    trialCount: args.trialCount,
    cases: subject.cases.length,
    variants: subject.variants.length,
  };

  const engine = new EvalEngine({ subject });
  const unsubscribePrinter = subscribeConsolePrinter({
    engine,
    subjectName: subject.name,
    meta,
    display: {
      sections: args.sections,
      cols: args.cols,
      sort: args.sort,
    },
  });

  const run = await engine.run({
    trialCount: args.trialCount,
    maxConcurrency: args.maxConcurrency,
    cacheMode: args.cacheMode,
    runId,
  });

  unsubscribePrinter();

  writeRunToDb({
    subjectName: subject.name,
    evalFile,
    casesDir,
    run,
  });

  console.log(`Run id: ${runId}`);
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
