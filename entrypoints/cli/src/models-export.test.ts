import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isModelsExport, runModelsExport } from './models-export';

const makeProject = (): string =>
  realpathSync(mkdtempSync(join(tmpdir(), 'undetermini-cli-export-')));

describe('isModelsExport', () => {
  it('reconnaît `models export` et rien d’autre', () => {
    expect(isModelsExport(['models', 'export'])).toBe(true);
    expect(isModelsExport(['models'])).toBe(false);
    expect(isModelsExport(['--models=x', 'export'])).toBe(false);
  });
});

describe('runModelsExport', () => {
  it('dossier neuf : code 0, config écrite, rapport affiché', () => {
    const dir = makeProject();
    const printed: string[] = [];

    const code = runModelsExport({ cwd: dir, print: (line) => printed.push(line) });

    expect(code).toBe(0);
    expect(existsSync(join(dir, 'undetermini.config.ts'))).toBe(true);
    expect(printed.join('\n')).toContain('2 modèles écrits');
  });

  it('config sans models à coller : code non nul, fichier intact', () => {
    const dir = makeProject();
    const path = join(dir, 'undetermini.config.ts');
    writeFileSync(path, 'export default { subjects: {} };\n');
    const printed: string[] = [];

    const code = runModelsExport({ cwd: dir, print: (line) => printed.push(line) });

    expect(code).not.toBe(0);
    expect(printed.join('\n')).toContain('models: [');
    expect(readFileSync(path, 'utf8')).toBe('export default { subjects: {} };\n');
  });

  it('--config : vise la config nommée, depuis un autre dossier', () => {
    const dir = makeProject();
    const path = join(dir, 'custom.config.ts');
    writeFileSync(path, 'export default defineConfig({ subjects: {} });\n');

    const code = runModelsExport({ configPath: path, cwd: tmpdir(), print: () => {} });

    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'custom.config.old.ts'), 'utf8')).toBe(
      'export default defineConfig({ subjects: {} });\n',
    );
    expect(readFileSync(path, 'utf8')).toContain('models: [');
  });
});
