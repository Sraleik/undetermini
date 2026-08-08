import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SubjectRegistry } from '@eval/subjects/registry';
import { defaultRegistry } from '@eval/subjects/registry';

export type UndeterminiConfig = SubjectRegistry;

/** Identity helper that exists for the type inference and the editor hints —
 *  the same role `defineConfig` plays in vite and vitest. */
export const defineConfig = (config: UndeterminiConfig): UndeterminiConfig =>
  config;

const CONFIG_NAMES = [
  'undetermini.config.ts',
  'undetermini.config.mts',
  'undetermini.config.js',
  'undetermini.config.mjs',
] as const;

/** Walk up from `startDir` looking for a config file, stopping at the filesystem
 *  root. Mirrors how vitest finds its own config: run the command from anywhere
 *  inside the project and it still resolves. */
export const findConfigFile = (startDir: string): string | null => {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** Import a config module. TypeScript configs go through tsx's programmatic
 *  loader — node cannot import a `.ts` on its own, and asking every host to
 *  pre-compile its config would defeat the point of having one. */
const importConfig = async (path: string): Promise<unknown> => {
  if (path.endsWith('.ts') || path.endsWith('.mts')) {
    const { tsImport } = await import('tsx/esm/api');
    return tsImport(pathToFileURL(path).href, import.meta.url);
  }
  return import(pathToFileURL(path).href);
};

const readRegistry = (mod: unknown, path: string): SubjectRegistry => {
  const config = (mod as { default?: unknown }).default ?? mod;
  const registry = config as Partial<SubjectRegistry>;
  if (registry.subjects === undefined) {
    throw new Error(
      `${path} does not export a config with a 'subjects' map. Export default defineConfig({ subjects, defaultSubject }).`,
    );
  }
  return {
    subjects: registry.subjects,
    defaultSubject:
      registry.defaultSubject ?? Object.keys(registry.subjects)[0] ?? '',
  };
};

export type LoadedRegistry = {
  registry: SubjectRegistry;
  /** Directory holding the config that was loaded, or null when the reference
   *  registry took over. Callers run from there so that every relative path a
   *  subject declares — its prompts directory above all — resolves against the
   *  project root rather than wherever the command happened to be typed. */
  projectDir: string | null;
};

/** Resolve the registry a run should use.
 *
 *  An explicit `--config` must exist — a typo there is an error, never a silent
 *  fallback to a registry the caller did not mean. With no `--config`, a missing
 *  config file is normal: the reference subject takes over so `npx undetermini`
 *  works in a project that has declared nothing. */
export const loadRegistry = async (
  explicitPath?: string,
  cwd: string = process.cwd(),
  opts: { chdirToProject?: boolean } = {},
): Promise<LoadedRegistry> => {
  // The chdir has to happen BEFORE the config is imported, not after: a subject
  // module can read files at import time — Kalent's does, loading a prompt from
  // `eval/prompts/` — and by then the working directory is already what decides
  // whether that relative path exists. Opt-in, so importing a config stays a
  // side-effect-free operation for every caller but the binaries.
  const enter = (dir: string): void => {
    if (opts.chdirToProject === true) process.chdir(dir);
  };
  if (explicitPath !== undefined) {
    const path = isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath);
    if (!existsSync(path)) {
      throw new Error(`--config file not found: ${path}`);
    }
    enter(dirname(path));
    return {
      registry: readRegistry(await importConfig(path), path),
      projectDir: dirname(path),
    };
  }
  const found = findConfigFile(cwd);
  if (found === null) return { registry: defaultRegistry, projectDir: null };
  enter(dirname(found));
  return {
    registry: readRegistry(await importConfig(found), found),
    projectDir: dirname(found),
  };
};

/** Pull `--config <path>` / `--config=<path>` out of the argv slice before the
 *  eval parser sees it — that parser rejects options it does not declare. */
export const takeConfigFlag = (
  argv: readonly string[],
): { configPath?: string; rest: string[] } => {
  const rest: string[] = [];
  let configPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
      continue;
    }
    rest.push(arg);
  }
  return { configPath, rest };
};
