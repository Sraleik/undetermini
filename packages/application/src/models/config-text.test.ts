import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Model } from '@undetermini/core/models/model';
import { describe, expect, it } from 'vitest';
import {
  insertModels,
  newConfigText,
  renderModelsBlock,
} from './config-text';

const price = {
  from: '2026-01-01',
  input: '0.075',
  output: '0.3',
  cachedInput: '0.01',
};

const complete: Model = {
  provider: 'openai',
  id: 'gpt-5.4-mini',
  price: [price],
  settings: {
    'eff-low': { reasoningEffort: 'low' },
    'think-4096': { thinkingBudgetTokens: 4096 },
  },
};

const retired: Model = {
  provider: 'anthropic',
  id: 'claude-old',
  price: [price],
  retired: true,
};

const unpriced: Model = { provider: 'openrouter', id: 'acme/model', price: [] };

const existingConfig = `import { defineConfig } from 'undetermini';
import { extraction } from './subjects/extraction';

export default defineConfig({
  subjects: { extraction },
});
`;

// Same evaluation path as `config.ts`: the block is TypeScript text, and only a
// real tsx import proves that what we print is what the loader reads back.
const evaluate = async (text: string): Promise<{ models: Model[] }> => {
  const dir = mkdtempSync(join(tmpdir(), 'undetermini-config-text-'));
  const path = join(dir, 'config.ts');
  writeFileSync(path, text);
  const { tsImport } = await import('tsx/esm/api');
  const mod = (await tsImport(pathToFileURL(path).href, import.meta.url)) as {
    default: { models?: Model[]; default?: { models: Model[] } };
  };
  return (mod.default.default ?? mod.default) as { models: Model[] };
};

describe('renderModelsBlock', () => {
  it('renders provider, id, string prices and named settings', () => {
    const block = renderModelsBlock([complete], {});

    expect(block).toContain("provider: 'openai'");
    expect(block).toContain("id: 'gpt-5.4-mini'");
    expect(block).toContain("input: '0.075'");
    expect(block).toContain("'eff-low': { reasoningEffort: 'low' }");
    expect(block).toContain("'think-4096': { thinkingBudgetTokens: 4096 }");
  });

  it('marks a retired model and puts the reason in a one-line comment', () => {
    const block = renderModelsBlock([retired], {
      'anthropic:claude-old': 'retiré : absent de la liste intégrée',
    });

    expect(block).toContain('retired: true');
    expect(block).toContain('// retiré : absent de la liste intégrée');
  });

  it('renders a model without price as an empty list, with its comment', () => {
    const block = renderModelsBlock([unpriced], {
      'openrouter:acme/model': 'sans prix',
    });

    expect(block).toContain('price: []');
    expect(block).toContain('// sans prix');
  });

  it('is read back by tsx as the same models', async () => {
    const models = [complete, retired, unpriced];
    const block = renderModelsBlock(models, {
      'openrouter:acme/model': 'sans prix',
    });

    const loaded = await evaluate(`export default {\n${block}\n};\n`);

    expect(loaded.models).toEqual(models);
  });
});

describe('insertModels', () => {
  it('keeps the original text intact and adds models after defineConfig({', () => {
    const block = renderModelsBlock([complete], {});

    const result = insertModels(existingConfig, block);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('defineConfig({\n  models: [');
    expect(result.text.replace(block, '').replace('defineConfig({\n', 'defineConfig({')).toContain(
      "subjects: { extraction },",
    );
    expect(result.text).toContain("import { extraction } from './subjects/extraction';");
  });

  it('refuses a config without defineConfig({', () => {
    const result = insertModels(
      'export default { subjects: {} };\n',
      'models: [],',
    );

    expect(result).toEqual({ ok: false, reason: 'no-define-config' });
  });

  it('refuses a config that already declares models', () => {
    const result = insertModels(
      'export default defineConfig({\n  models: [],\n  subjects: {},\n});\n',
      'models: [],',
    );

    expect(result).toEqual({ ok: false, reason: 'models-present' });
  });
});

describe('newConfigText', () => {
  it('writes a complete config that tsx loads with the same models', async () => {
    const block = renderModelsBlock([complete], {});

    const text = newConfigText(block);

    expect(text).toContain("import { defineConfig } from 'undetermini';");
    expect(text).toContain('subjects: {}');
    const withoutImport = text
      .replace("import { defineConfig } from 'undetermini';", 'const defineConfig = <T>(config: T) => config;');
    const loaded = await evaluate(withoutImport);
    expect(loaded.models).toEqual([complete]);
  });
});
