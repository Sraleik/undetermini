import { describe, expect, it } from 'vitest';
import { builtinModels } from './builtin';
import { planExport } from './export-plan';
import type { PricePeriod } from './model';

const price = (input: string): PricePeriod[] => [
  { from: '2026-01-01', input, output: '9', cachedInput: '0.1' },
];

const builtin = builtinModels();
const find = (id: string) => {
  const model = builtin.find((m) => m.id === id);
  if (model === undefined) throw new Error(`modèle absent : ${id}`);
  return model;
};

describe('planExport', () => {
  it('sans essai : la paire de démarrage, au prix de la liste intégrée', () => {
    const { models, flagged } = planExport({ tried: [], builtin });
    expect(models.map((m) => `${m.provider}:${m.id}`)).toEqual([
      'openai:gpt-5.4-mini',
      'anthropic:claude-haiku-4-5',
    ]);
    expect(models[0]).toEqual(find('gpt-5.4-mini'));
    expect(models[1]?.settings).toEqual({
      'think-1024': { thinkingBudgetTokens: 1024 },
      'think-4096': { thinkingBudgetTokens: 4096 },
    });
    expect(models[1]?.price).toEqual(find('claude-haiku-4-5').price);
    expect(flagged).toEqual([]);
  });

  describe('modèles essayés', () => {
    const plan = planExport({
      builtin,
      tried: [
        { provider: 'openai', modelId: 'gpt-4o-mini', variantNames: ['gpt-4o-mini'], lastPrice: price('1') },
        { provider: 'anthropic', modelId: 'claude-haiku-4-5', variantNames: [], lastPrice: price('2') },
        {
          provider: 'anthropic',
          modelId: 'claude-old-1',
          variantNames: ['claude-old-1__think-2048'],
          lastPrice: price('3'),
        },
        { provider: 'openrouter', modelId: 'vendor/model-x', variantNames: [], lastPrice: [] },
      ],
    });

    it('écrit une déclaration par modèle essayé', () => {
      expect(plan.models).toHaveLength(4);
    });

    it('un modèle de la liste reprend la déclaration de la liste, prix courant compris', () => {
      expect(plan.models[0]).toEqual(find('gpt-4o-mini'));
      expect(plan.models[1]).toEqual(find('claude-haiku-4-5'));
    });

    it('un modèle sorti de la liste est retiré, au dernier prix connu', () => {
      expect(plan.models[2]).toEqual({
        provider: 'anthropic',
        id: 'claude-old-1',
        price: price('3'),
        retired: true,
        settings: { 'think-2048': { thinkingBudgetTokens: 2048 } },
      });
    });

    it('un modèle openrouter hors liste est écrit sans prix', () => {
      expect(plan.models[3]).toEqual({
        provider: 'openrouter',
        id: 'vendor/model-x',
        price: [],
      });
    });

    it('signale les deux derniers', () => {
      expect(plan.flagged).toEqual([
        { key: 'anthropic:claude-old-1', reason: 'retired' },
        { key: 'openrouter:vendor/model-x', reason: 'unpriced' },
      ]);
    });
  });

  it('un modèle openrouter présent dans la liste reprend la liste sans signalement', () => {
    const listed = { provider: 'openrouter', id: 'vendor/listed', price: price('4') };
    const { models, flagged } = planExport({
      builtin: [listed],
      tried: [{ provider: 'openrouter', modelId: 'vendor/listed', variantNames: [], lastPrice: [] }],
    });
    expect(models).toEqual([listed]);
    expect(flagged).toEqual([]);
  });

  describe('réglages d’un modèle retiré', () => {
    const settingsFor = (variantNames: string[]) =>
      planExport({
        builtin,
        tried: [{ provider: 'anthropic', modelId: 'gone', variantNames, lastPrice: price('1') }],
      }).models[0]?.settings;

    it('déduit eff et think des noms de variantes', () => {
      expect(settingsFor(['x__eff-low', 'x__think-4096__sys-v2'])).toEqual({
        'eff-low': { reasoningEffort: 'low' },
        'think-4096': { thinkingBudgetTokens: 4096 },
      });
    });

    it('un nom libre ne donne aucun réglage', () => {
      expect(settingsFor(['gone', 'gone__sys-v2', 'gone__ma-variante'])).toBeUndefined();
    });
  });
});
