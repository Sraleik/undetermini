import { expandModels } from '@undetermini/core/models/expand';
import { resolveSysPrompts } from '@undetermini/application/axes/resolve-sys-prompts';
import { EvalEngine } from '@undetermini/application/api';
import { parseEvalArgs } from './cli-args';
import { subscribeConsolePrinter } from './console-printer';
import { readGitState } from '@undetermini/application/git-state';
import { writeRunToDb } from '@undetermini/application/storage/write';
import type { SubjectRegistry } from '@undetermini/application/subjects/registry';
import { defaultRegistry, resolveIn } from '@undetermini/application/subjects/registry';
import { resolveSchemaAxis } from '@undetermini/application/subjects/schema-axis';

/** Run the eval CLI against a host's subject registry. The published binary
 *  calls this with the reference registry; a host with its own subjects calls
 *  it with theirs — the registry is the composition root and belongs to the
 *  host, not to the harness. */
export const runEvalCli = async (
  registry: SubjectRegistry = defaultRegistry,
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const args = parseEvalArgs(argv, registry.models);

  const {
    subject: evalSubject,
    evalFile,
    casesDir,
    promptsDir,
    schemas,
  } = resolveIn(registry, args.subject ?? registry.defaultSubject);

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
    const sysPrompts = resolveSysPrompts(
      args.cartesian.sysPromptTokens,
      promptsDir,
    );
    const variants = expandModels({
      models: args.cartesian.entries,
      sysPrompts,
      schemas: resolveSchemaAxis(args.cartesian.schemaTokens, schemas),
    });
    if (variants.length === 0) {
      throw new Error(
        `Cartesian expansion produced 0 variants — none of the chosen --models declares the requested --settings. Check them against the models declared in undetermini.config.ts.`,
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

  const engine = new EvalEngine({ subject, catalog: registry.models });
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
    catalog: registry.models,
  });

  console.log(`Run id: ${runId}`);
};


