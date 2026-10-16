import { describe, expect, it } from 'vitest';
import { MODEL_CAPABILITIES } from '../axes/model-capabilities';
import { MODEL_PRICING_USD_PER_1M } from '../pricing';
import { builtinModels } from './builtin';

const find = (id: string) => {
  const model = builtinModels().find((m) => m.id === id);
  if (model === undefined) throw new Error(`modèle absent : ${id}`);
  return model;
};

describe('builtinModels', () => {
  it('gpt-5 porte un réglage par effort accepté', () => {
    expect(find('gpt-5').settings?.['eff-low']).toEqual({
      reasoningEffort: 'low',
    });
  });

  it('gpt-5.1 envoie `none` à la place de `minimal`', () => {
    expect(find('gpt-5.1').settings?.['eff-minimal']).toEqual({
      reasoningEffort: 'none',
    });
  });

  it('un modèle à budget porte les 4 réglages think-*', () => {
    expect(find('claude-haiku-4-5').settings).toEqual({
      'think-4096': { thinkingBudgetTokens: 4096 },
      'think-8192': { thinkingBudgetTokens: 8192 },
      'think-16384': { thinkingBudgetTokens: 16384 },
      'think-32768': { thinkingBudgetTokens: 32768 },
    });
  });

  it('un modèle adaptatif n’a aucun réglage', () => {
    expect(find('claude-opus-4-7').settings).toBeUndefined();
  });

  it('un modèle sans capacité de raisonnement n’a aucun réglage', () => {
    expect(find('gpt-4o-mini').settings).toBeUndefined();
  });

  it('chaque modèle a un fournisseur', () => {
    for (const model of builtinModels()) {
      expect(model.provider, model.id).toBeTruthy();
    }
  });

  it('les prix sont une période unique en chaînes décimales', () => {
    expect(find('gpt-4o-mini').price).toEqual([
      { from: '2000-01-01', input: '0.15', output: '0.6', cachedInput: '0.075' },
    ]);
    for (const model of builtinModels()) {
      for (const period of model.price) {
        for (const amount of [period.input, period.output, period.cachedInput]) {
          expect(amount, model.id).toMatch(/^\d+(\.\d+)?$/);
        }
      }
    }
  });

  it('un modèle sans prix dans la table aurait `price: []`, les autres une période', () => {
    for (const model of builtinModels()) {
      expect(model.price, model.id).toHaveLength(
        model.id in MODEL_PRICING_USD_PER_1M ? 1 : 0,
      );
    }
  });

  // Ces ids ont un prix mais aucune capacité : le moteur ne devine jamais un fournisseur.
  it('exclut les ids de la table de prix sans capacité', () => {
    const excluded = Object.keys(MODEL_PRICING_USD_PER_1M).filter(
      (id) => !(id in MODEL_CAPABILITIES),
    );
    expect(excluded.sort()).toEqual([
      'claude-haiku-4-5-20251001',
      'openai/gpt-4.1-mini',
    ]);
    const ids = builtinModels().map((m) => m.id);
    for (const id of excluded) expect(ids).not.toContain(id);
  });
});
