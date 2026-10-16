import { describe, expect, it } from 'vitest';
import type { Model } from './model';
import { expandModels } from './expand';

type Setting = { reasoningEffort?: string; thinkingBudgetTokens?: number };

const sonnetOn = (provider: string): Model<Setting> => ({
  provider,
  id: 'claude-sonnet-5-5',
  price: [],
  settings: {
    'think-4096': { thinkingBudgetTokens: 4096 },
    'think-8192': { thinkingBudgetTokens: 8192 },
  },
});

const gpt5: Model<Setting> = {
  provider: 'openai',
  id: 'gpt-5',
  price: [],
  settings: { 'eff-low': { reasoningEffort: 'low' } },
};

describe('expandModels', () => {
  // Cas vécu : Sonnet en direct et via OpenRouter perdait sa réflexion (SRA-940).
  it('keeps one variant per route and setting for the same model id', () => {
    const variants = expandModels({
      models: [
        { model: sonnetOn('anthropic'), settingNames: ['think-4096', 'think-8192'] },
        { model: sonnetOn('openrouter'), settingNames: ['think-4096', 'think-8192'] },
      ],
      sysPrompts: [],
      schemas: [],
    });

    expect(variants.map((v) => [v.name, v.provider])).toEqual([
      ['anthropic:claude-sonnet-5-5__think-4096', 'anthropic'],
      ['anthropic:claude-sonnet-5-5__think-8192', 'anthropic'],
      ['openrouter:claude-sonnet-5-5__think-4096', 'openrouter'],
      ['openrouter:claude-sonnet-5-5__think-8192', 'openrouter'],
    ]);
  });

  // Canari ISC-12 : le nom et le réglage de gpt-5__eff-low ne bougent pas.
  it('names a declared setting after the id and carries its value as is', () => {
    const [variant] = expandModels({
      models: [{ model: gpt5, settingNames: ['eff-low'] }],
      sysPrompts: [],
      schemas: [],
    });

    expect(variant).toEqual({
      name: 'gpt-5__eff-low',
      provider: 'openai',
      modelId: 'gpt-5',
      settingName: 'eff-low',
      setting: { reasoningEffort: 'low' },
    });
  });

  it('gives the unset variant to the default setting', () => {
    const [variant] = expandModels({
      models: [{ model: gpt5, settingNames: ['default'] }],
      sysPrompts: [],
      schemas: [],
    });

    expect(variant).toEqual({ name: 'gpt-5', provider: 'openai', modelId: 'gpt-5' });
  });

  it('crosses settings with system prompts and schemas', () => {
    const variants = expandModels({
      models: [{ model: gpt5, settingNames: ['default', 'eff-low'] }],
      sysPrompts: ['default', { name: 'v2', text: 'be strict' }],
      schemas: [{ name: 'no-criteria' }],
    });

    expect(variants.map((v) => v.name)).toEqual([
      'gpt-5__sch-no-criteria',
      'gpt-5__sys-v2__sch-no-criteria',
      'gpt-5__eff-low__sch-no-criteria',
      'gpt-5__eff-low__sys-v2__sch-no-criteria',
    ]);
    expect(variants[3]).toMatchObject({
      systemPrompt: 'be strict',
      extractionSchemaName: 'no-criteria',
    });
  });

  it('refuses a setting the model does not declare, naming the model', () => {
    expect(() =>
      expandModels({
        models: [{ model: gpt5, settingNames: ['eff-high'] }],
        sysPrompts: [],
        schemas: [],
      }),
    ).toThrow(/openai:gpt-5.*eff-high/);
  });

  it('returns the same variants in the same order for the same input', () => {
    const inputs = {
      models: [{ model: gpt5, settingNames: ['default', 'eff-low'] }],
      sysPrompts: [],
      schemas: [],
    };
    expect(expandModels(inputs)).toEqual(expandModels(inputs));
  });
});
