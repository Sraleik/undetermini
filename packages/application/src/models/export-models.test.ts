import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '../config';
import { closeEvalDb, openEvalDb } from '../storage/schema';
import { exportModels } from './export-models';

const cwdBefore = process.cwd();
afterEach(() => {
  closeEvalDb();
  process.chdir(cwdBefore);
});

// Each case works in a throwaway folder, never in a real project's database.
// `undetermini` is stubbed in node_modules: the written config imports it, and
// the folder has no install.
const makeProject = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'undetermini-export-')));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  const stub = join(dir, 'node_modules', 'undetermini');
  mkdirSync(stub, { recursive: true });
  writeFileSync(
    join(stub, 'package.json'),
    '{"name":"undetermini","type":"module","main":"index.js"}\n',
  );
  writeFileSync(join(stub, 'index.js'), 'export const defineConfig = (c) => c;\n');
  return dir;
};

const configPath = (dir: string) => join(dir, 'undetermini.config.ts');
const oldPath = (dir: string) => join(dir, 'undetermini.config.old.ts');
const dbPath = (dir: string) => join(dir, 'eval-results', 'eval.db');

const flatPrice = { input: 0.15, output: 0.6, cachedInput: 0.075 };
const period = (input: string) => [
  { from: '2026-01-01', input, output: '9', cachedInput: '0.1' },
];

type Seed = { provider: string; modelId: string; variant: string };

/** One run per entry of `runs`, each trial created in its run. */
const seedHistory = (
  dir: string,
  runs: { id: string; startedAt: string; pricing: unknown; trials: Seed[] }[],
): void => {
  const db = openEvalDb(dbPath(dir));
  const insertRun = db.prepare(
    `INSERT INTO runs (id, started_at, finished_at, duration_ms, git_sha, git_dirty,
       dataset_hash, eval_file, cases_dir, subject_name, pricing_table_json, pricing_verified_at)
     VALUES (?, ?, ?, 1, 'sha', 0, 'h', 'e', 'c', 's', ?, ?)`,
  );
  const insertTrial = db.prepare(
    `INSERT INTO trials (id, model_id, provider, prompt_sha, static_hash, trial_index, case_id,
       case_slug_at_creation, variant_name, created_in_run_id, latency_ms, status, created_at)
     VALUES (?, ?, ?, 'p', 's', 0, 'c1', 'c1', ?, ?, 1, 'ok', ?)`,
  );
  let n = 0;
  for (const run of runs) {
    insertRun.run(
      run.id,
      run.startedAt,
      run.startedAt,
      JSON.stringify(run.pricing),
      run.startedAt.slice(0, 10),
    );
    for (const t of run.trials) {
      n += 1;
      insertTrial.run(`t${n}`, t.modelId, t.provider, t.variant, run.id, run.startedAt);
    }
  }
  closeEvalDb();
};

const declaredKeys = async (dir: string): Promise<string[]> => {
  const { registry } = await loadRegistry(configPath(dir), dir, { onWarning: () => {} });
  if (registry.models === undefined) {
    throw new Error('le chargeur doit rendre un catalogue de modèles');
  }
  return registry.models.models.map((m) => `${m.provider}:${m.id}`);
};

describe('exportModels', () => {
  it('dossier neuf sans base : la config écrite porte exactement 2 modèles, et le chargeur la lit', async () => {
    const dir = makeProject();

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('written');
    expect(existsSync(oldPath(dir))).toBe(false);
    expect(existsSync(dbPath(dir))).toBe(false);
    expect(await declaredKeys(dir)).toEqual([
      'openai:gpt-5.4-mini',
      'anthropic:claude-haiku-4-5',
    ]);
  });

  it('base avec 4 modèles essayés : 4 déclarations, la sortie nomme le retiré et le sans prix', async () => {
    const dir = makeProject();
    seedHistory(dir, [
      {
        id: 'old',
        startedAt: '2026-08-01T10:00:00.000Z',
        pricing: { 'gpt-3.5-turbo': flatPrice },
        trials: [],
      },
      {
        id: 'new',
        startedAt: '2026-09-01T10:00:00.000Z',
        pricing: { version: 2, models: { 'openai:gpt-3.5-turbo': period('0.5') } },
        trials: [
          { provider: 'openai', modelId: 'gpt-4o-mini', variant: 'gpt-4o-mini' },
          { provider: 'anthropic', modelId: 'claude-haiku-4-5', variant: 'claude-haiku-4-5' },
          { provider: 'openai', modelId: 'gpt-3.5-turbo', variant: 'gpt-3.5-turbo__eff-low' },
          { provider: 'openrouter', modelId: 'meta/llama', variant: 'meta/llama' },
        ],
      },
    ]);

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('written');
    expect(result.flagged).toEqual([
      { key: 'openai:gpt-3.5-turbo', reason: 'retired' },
      { key: 'openrouter:meta/llama', reason: 'unpriced' },
    ]);
    expect(result.report).toContain('openai:gpt-3.5-turbo');
    expect(result.report).toContain('openrouter:meta/llama');
    expect(await declaredKeys(dir)).toHaveLength(4);
    const text = readFileSync(configPath(dir), 'utf8');
    expect(text).toContain('retired: true');
    expect(text).toContain("'eff-low': { reasoningEffort: 'low' }");
    expect(text).toContain("input: '0.5'");
  });

  it('relit le prix du format plat historique quand aucun run récent ne le porte', () => {
    const dir = makeProject();
    seedHistory(dir, [
      {
        id: 'flat',
        startedAt: '2026-08-01T10:00:00.000Z',
        pricing: { 'gpt-3.5-turbo': flatPrice },
        trials: [{ provider: 'openai', modelId: 'gpt-3.5-turbo', variant: 'gpt-3.5-turbo' }],
      },
    ]);

    exportModels({ projectDir: dir });

    const text = readFileSync(configPath(dir), 'utf8');
    expect(text).toContain("from: '2026-08-01'");
    expect(text).toContain("input: '0.15'");
    expect(text).toContain("cachedInput: '0.075'");
  });

  it('config existante : copie .old identique à l’octet, puis models inséré', async () => {
    const dir = makeProject();
    const original = [
      "import { defineConfig } from 'undetermini';",
      '// ma config, écrite à la main',
      'export default defineConfig({',
      '  subjects: {},',
      '});',
      '',
    ].join('\n');
    writeFileSync(configPath(dir), original);

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('written');
    expect(readFileSync(oldPath(dir))).toEqual(Buffer.from(original));
    const text = readFileSync(configPath(dir), 'utf8');
    expect(text).toContain('// ma config, écrite à la main');
    expect(await declaredKeys(dir)).toHaveLength(2);
  });

  it('config sans defineConfig({ : rien n’est écrit, le bloc s’affiche', () => {
    const dir = makeProject();
    const original = 'export default { subjects: {} };\n';
    writeFileSync(configPath(dir), original);

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('refused');
    expect(result.report).toContain('models: [');
    expect(readFileSync(configPath(dir), 'utf8')).toBe(original);
    expect(existsSync(oldPath(dir))).toBe(false);
  });

  it('config qui déclare déjà models : rien n’est écrit, le bloc s’affiche', () => {
    const dir = makeProject();
    const original = 'export default defineConfig({ subjects: {}, models: [] });\n';
    writeFileSync(configPath(dir), original);

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('refused');
    expect(result.report).toContain('models: [');
    expect(readFileSync(configPath(dir), 'utf8')).toBe(original);
    expect(existsSync(oldPath(dir))).toBe(false);
  });

  it('copie .old déjà présente : refus, rien n’est écrasé', () => {
    const dir = makeProject();
    writeFileSync(configPath(dir), 'export default defineConfig({ subjects: {} });\n');
    writeFileSync(oldPath(dir), 'ancienne copie\n');

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('refused');
    expect(readFileSync(oldPath(dir), 'utf8')).toBe('ancienne copie\n');
    expect(readFileSync(configPath(dir), 'utf8')).toBe(
      'export default defineConfig({ subjects: {} });\n',
    );
  });

  it('base sans table trials : traitée comme un projet neuf', () => {
    const dir = makeProject();
    mkdirSync(join(dir, 'eval-results'));
    new Database(dbPath(dir)).close();

    const result = exportModels({ projectDir: dir });

    expect(result.status).toBe('written');
    expect(result.flagged).toEqual([]);
  });
});
