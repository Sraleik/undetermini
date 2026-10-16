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

// Models are declared in the project's config (ADR 0003). Each case writes its
// own config in a fresh folder: the loader imports by path and node caches
// modules, so a shared file would hand back the first test's models.
const makeProject = (body: string): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'undetermini-models-')));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  const path = join(dir, 'undetermini.config.ts');
  writeFileSync(path, `export default ${body};\n`);
  return path;
};

const PRICE = `[{ from: '2026-01-01', input: '1', output: '2', cachedInput: '0.5' }]`;

it('keeps a declared mistral model in the catalog and uses no other source', async () => {
  const path = makeProject(
    `{ subjects: { s: {} }, models: [{ provider: 'mistral', id: 'large', price: ${PRICE} }] }`,
  );
  const { registry } = await loadRegistry(path, cwdBefore);

  expect(registry.models?.find('mistral', 'large')).toBeDefined();
  expect(registry.models?.models).toHaveLength(1);
});

it('refuses a model declared without a provider and names it', async () => {
  const path = makeProject(
    `{ subjects: { s: {} }, models: [{ id: 'orphan', price: ${PRICE} }] }`,
  );

  await expect(loadRegistry(path, cwdBefore)).rejects.toThrow(
    new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*orphan`),
  );
});

it('falls back on the builtin list and warns with the export command', async () => {
  const path = makeProject(`{ subjects: { s: {} } }`);
  const warnings: string[] = [];
  const { registry } = await loadRegistry(path, cwdBefore, {
    onWarning: (message) => warnings.push(message),
  });

  expect(registry.models?.models.length).toBeGreaterThan(0);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('undetermini models export');
  expect(warnings[0]).toContain(path);
});

it('warns once about a model declared without a price', async () => {
  const path = makeProject(
    `{ subjects: { s: {} }, models: [{ provider: 'mistral', id: 'large', price: [] }, { provider: 'mistral', id: 'small', price: ${PRICE} }] }`,
  );
  const warnings: string[] = [];
  await loadRegistry(path, cwdBefore, {
    onWarning: (message) => warnings.push(message),
  });

  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('mistral:large');
});

it('refuses a static variant aimed at an undeclared model and names the variant', async () => {
  const path = makeProject(
    `{ subjects: { s: { subject: { name: 's', variants: [{ name: 'ghost__low', provider: 'mistral', modelId: 'ghost' }] } } }, models: [{ provider: 'mistral', id: 'large', price: ${PRICE} }] }`,
  );

  await expect(loadRegistry(path, cwdBefore)).rejects.toThrow(/ghost__low/);
});
