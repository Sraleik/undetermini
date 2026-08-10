import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { loadRegistry } from './config';

// The bug this guards: the binaries used to read the `.env` of whatever
// directory the command was typed in, and to import the host's config before
// moving into the project. A subject that builds its provider client at import
// time then found no key, and one that loads a prompt by relative path found no
// file. Both faults are invisible from inside this repo — they only appear when
// the command runs from somewhere else.
//
// The config records what it saw AT IMPORT TIME: that is the only moment where
// the ordering is observable. Asserting on the returned registry would pass on
// the broken code too.
//
// One `loadRegistry` call with `loadEnv` per file, on purpose: `dotenv/config`
// reads `${cwd}/.env` the first time it is imported and caches, so a second
// call in the same worker would observe nothing.
const project = realpathSync(mkdtempSync(join(tmpdir(), 'undetermini-env-')));
const witness = join(project, 'witness.json');
const cwdBefore = process.cwd();

// A host project always has one, and without it tsx transpiles the config to
// CommonJS — `export default` then arrives one level deeper and the loader
// rejects it. The fixture has to look like a real project, not just a folder.
writeFileSync(join(project, 'package.json'), '{"type":"module"}\n');
writeFileSync(join(project, '.env'), 'UNDETERMINI_ENV_PROBE=from-project\n');
writeFileSync(
  join(project, 'undetermini.config.ts'),
  `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(witness)}, JSON.stringify({
  cwd: process.cwd(),
  probe: process.env.UNDETERMINI_ENV_PROBE ?? null,
}));
export default { subjects: { probe: {} }, defaultSubject: 'probe' };
`,
);

afterAll(() => process.chdir(cwdBefore));

it('enters the project and loads its .env before importing the config', async () => {
  await loadRegistry(join(project, 'undetermini.config.ts'), cwdBefore, {
    chdirToProject: true,
    loadEnv: true,
  });

  const seen = JSON.parse(readFileSync(witness, 'utf8'));
  expect(realpathSync(seen.cwd)).toBe(project);
  expect(seen.probe).toBe('from-project');
});
