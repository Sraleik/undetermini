import { describe, expect, it } from 'vitest';
import { builtinModels, type BuiltinSetting } from '@undetermini/core/models/builtin';
import { expandModels } from '@undetermini/core/models/expand';
import { resolveVariantConfigIds } from './variant-config-id';

// Cas vécu : les ids de `variant_configs` déjà en base ne doivent pas bouger
// quand la variante change de forme (SRA-945, ISC-12). Sinon le cache ne rejoue
// plus aucun essai existant.
const SYSTEM_PROMPT = 'You are a careful assistant.';
const GPT_5_EFF_LOW_ID = '129471165d85ab7d261dfe8e8ba0d7f652f52403c70df1b2a1dc3ae77b99e4d2';

// Ancienne forme d'`EvalVariant`, figée ici : la bascule change ce type.
type LegacyVariant = {
  name: string;
  provider: 'openai';
  modelId: string;
  reasoningEffort?: 'low';
};

describe('variant_config_id de gpt-5__eff-low', () => {
  it('ancienne forme : id littéral', () => {
    const legacy: LegacyVariant = {
      name: 'gpt-5__eff-low',
      provider: 'openai',
      modelId: 'gpt-5',
      reasoningEffort: 'low',
    };
    const ids = resolveVariantConfigIds({
      systemPrompt: SYSTEM_PROMPT,
      variants: [legacy],
      buildProviderOptions: (variant) =>
        variant.reasoningEffort === undefined
          ? undefined
          : { openai: { reasoningEffort: variant.reasoningEffort } },
    });
    expect(ids.get('gpt-5__eff-low')?.configId).toBe(GPT_5_EFF_LOW_ID);
  });

  it('forme déclarée : builtinModels puis expandModels donnent le même id', () => {
    const gpt5 = builtinModels().find((model) => model.id === 'gpt-5');
    expect(gpt5).toBeDefined();
    const variants = expandModels<BuiltinSetting>({
      models: [{ model: gpt5!, settingNames: ['eff-low'] }],
      sysPrompts: [],
      schemas: [],
    });
    const ids = resolveVariantConfigIds({
      systemPrompt: SYSTEM_PROMPT,
      variants,
      buildProviderOptions: (variant) =>
        variant.setting === undefined
          ? undefined
          : { openai: variant.setting as Record<string, unknown> },
    });
    expect(variants.map((variant) => variant.name)).toEqual(['gpt-5__eff-low']);
    expect(ids.get('gpt-5__eff-low')?.configId).toBe(GPT_5_EFF_LOW_ID);
  });
});
