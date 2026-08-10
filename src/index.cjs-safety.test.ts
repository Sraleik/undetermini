import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The bug this guards: the TUI reaches `ink`, an ESM module with top-level
// await. The day anything reachable from the public barrel imports it, the
// CommonJS build throws ERR_REQUIRE_ASYNC_MODULE for a consumer that only
// wanted `EvalEngine` — and nothing in the build fails, so it ships.
//
// Checked on the import graph rather than on `dist/`: the failure then names
// the file that broke the rule, and no build step is needed to see it.
const BANNED_FROM_THE_BARREL = ['ink', 'react'];

const ROOT = resolve(import.meta.dirname, '..');

// Les mêmes alias que tsconfig.json et vitest.config.ts. Le graphe se marche à
// la main : rien d'autre ne dit ce que le barrel atteint AVANT le build.
const ALIASES: [string, string][] = [
  ['@undetermini/core/', 'packages/core/src'],
  ['@undetermini/application/', 'packages/application/src'],
  ['@undetermini/cli/', 'entrypoints/cli/src'],
  ['@undetermini/tui/', 'entrypoints/tui/src'],
  ['@undetermini/examples/', 'examples'],
];

const resolveImport = (spec: string, fromFile: string): string | null => {
  const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix));
  const path = alias
    ? resolve(ROOT, alias[1], spec.slice(alias[0].length))
    : spec.startsWith('.')
      ? resolve(dirname(fromFile), spec)
      : null;
  if (path === null) return null;
  for (const candidate of [
    `${path}.ts`,
    `${path}.tsx`,
    `${path}/index.ts`,
    path,
  ]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  }
  return null;
};

/** Every module specifier imported by `file`, static and dynamic alike. */
const importsOf = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) specs.push(match[1]);
  for (const match of source.matchAll(/import\('([^']+)'\)/g))
    specs.push(match[1]);
  return specs;
};

/** Walk the barrel's import graph, collecting every bare package it can reach. */
const reachablePackages = (entry: string): Map<string, string> => {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      const local = resolveImport(spec, file);
      if (local !== null) {
        queue.push(local);
        continue;
      }
      if (!spec.startsWith('node:') && !found.has(spec))
        found.set(spec, file.slice(ROOT.length + 1));
    }
  }
  return found;
};

describe('the public barrel stays loadable from CommonJS', () => {
  it('cannot reach ink or react', () => {
    const packages = reachablePackages(resolve(ROOT, "src/index.ts"));
    const offenders = BANNED_FROM_THE_BARREL.filter((name) =>
      packages.has(name),
    ).map((name) => `${name} (via ${packages.get(name)})`);
    expect(offenders).toEqual([]);
  });

  it('walks a real graph — the barrel reaches the packages the engine needs', () => {
    const packages = reachablePackages(resolve(ROOT, "src/index.ts"));
    expect(packages.has('better-sqlite3')).toBe(true);
  });
});
