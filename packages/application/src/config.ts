import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtinModels } from '@undetermini/core/models/builtin';
import { type Catalog, decodeCatalog } from '@undetermini/core/models/catalog';
import type { Model } from '@undetermini/core/models/model';
import type { SubjectRegistry } from './subjects/registry';
import { defaultRegistry } from './subjects/registry';

export type UndeterminiConfig<TSetting = unknown> = Omit<
  SubjectRegistry,
  'models'
> & {
  /** The project's models. When present, the only source: no merge with the builtin list. */
  models?: Model<TSetting>[];
};

/** Identity helper that exists for the type inference and the editor hints —
 *  the same role `defineConfig` plays in vite and vitest. */
export const defineConfig = <TSetting = unknown>(
  config: UndeterminiConfig<TSetting>,
): UndeterminiConfig<TSetting> => config;

type OnWarning = (message: string) => void;

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

const decodeOrThrow = (
  raw: unknown,
  path: string,
  onWarning: OnWarning,
): Catalog => {
  const decoded = decodeCatalog(raw);
  if (!decoded.ok) {
    throw new Error(
      `${path} : modèles refusés.\n${decoded.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
  decoded.warnings.forEach(onWarning);
  return decoded.catalog;
};

/** Every static variant of a subject must aim at a declared (provider, id) pair. */
const checkStaticVariants = (
  subjects: SubjectRegistry['subjects'],
  catalog: Catalog,
  path: string,
): void => {
  const refused: string[] = [];
  for (const [name, entry] of Object.entries(subjects)) {
    for (const variant of entry.subject?.variants ?? []) {
      if (catalog.find(variant.provider, variant.modelId) === undefined) {
        refused.push(
          `sujet « ${name} », variante « ${variant.name} » : ${variant.provider}:${variant.modelId} n'est pas déclaré`,
        );
      }
    }
  }
  if (refused.length > 0) {
    throw new Error(
      `${path} : variantes vers un modèle non déclaré.\n${refused.map((line) => `- ${line}`).join('\n')}`,
    );
  }
};

const readRegistry = (
  mod: unknown,
  path: string,
  onWarning: OnWarning,
): SubjectRegistry => {
  const config = (mod as { default?: unknown }).default ?? mod;
  const registry = config as Partial<UndeterminiConfig>;
  if (registry.subjects === undefined) {
    throw new Error(
      `${path} does not export a config with a 'subjects' map. Export default defineConfig({ subjects, defaultSubject }).`,
    );
  }
  let models: Catalog;
  if (registry.models === undefined) {
    onWarning(
      `aucun modèle déclaré dans ${path} : liste intégrée utilisée ; lancez \`undetermini models export\``,
    );
    models = decodeOrThrow(builtinModels(), path, onWarning);
  } else {
    models = decodeOrThrow(registry.models, path, onWarning);
    checkStaticVariants(registry.subjects, models, path);
  }
  return {
    subjects: registry.subjects,
    defaultSubject:
      registry.defaultSubject ?? Object.keys(registry.subjects)[0] ?? '',
    models,
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
  opts: {
    chdirToProject?: boolean;
    loadEnv?: boolean;
    /** Receives the load-time warnings (builtin list used, unknown price). */
    onWarning?: OnWarning;
  } = {},
): Promise<LoadedRegistry> => {
  const onWarning = opts.onWarning ?? ((message: string) => console.warn(message));
  // The chdir has to happen BEFORE the config is imported, not after: a subject
  // module can read files at import time — Kalent's does, loading a prompt from
  // `eval/prompts/` — and by then the working directory is already what decides
  // whether that relative path exists. Opt-in, so importing a config stays a
  // side-effect-free operation for every caller but the binaries.
  //
  // `.env` is read here too, in the same window: after the chdir so it is the
  // project's file and not the caller's, and before the config module runs so a
  // subject that builds its provider client at import time still finds its keys.
  // A static `import 'dotenv/config'` cannot do this — it is hoisted to module
  // evaluation, long before either.
  const readEnv = async (): Promise<void> => {
    if (opts.loadEnv === true) await import('dotenv/config');
  };
  const enter = async (dir: string): Promise<void> => {
    if (opts.chdirToProject === true) process.chdir(dir);
    await readEnv();
  };
  if (explicitPath !== undefined) {
    const path = isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath);
    if (!existsSync(path)) {
      throw new Error(`--config file not found: ${path}`);
    }
    await enter(dirname(path));
    return {
      registry: readRegistry(await importConfig(path), path, onWarning),
      projectDir: dirname(path),
    };
  }
  const found = findConfigFile(cwd);
  if (found === null) {
    // No project to enter, but the caller still has an environment: the
    // reference subject calls a real provider, and `undetermini --subject=example`
    // has to find the key in the .env sitting right here.
    await readEnv();
    return { registry: defaultRegistry, projectDir: null };
  }
  await enter(dirname(found));
  return {
    registry: readRegistry(await importConfig(found), found, onWarning),
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
