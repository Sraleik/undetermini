import { describe, expect, it } from 'vitest';
import type { ModelVariant } from '@undetermini/core/models/variant';
import { summarizeAxes } from './axis-recap';

const variant = (over: Partial<ModelVariant> = {}): ModelVariant => ({
  name: 'gpt-4.1',
  provider: 'openai',
  modelId: 'gpt-4.1',
  ...over,
});

describe('summarizeAxes', () => {
  it('flags the all-default schema shape (the 2026-07-10 incident)', () => {
    const recap = summarizeAxes([
      variant(),
      variant({ name: 'claude-sonnet-5', provider: 'anthropic', modelId: 'claude-sonnet-5' }),
    ]);
    expect(recap.schemas).toEqual(['default']);
    expect(recap.schemasAllDefault).toBe(true);
    expect(recap.sysPrompts).toEqual(['default']);
  });

  it('does not flag when at least one variant carries a schema', () => {
    const recap = summarizeAxes([
      variant(),
      variant({
        name: 'gpt-4.1__sys-gate-v8-baseline__sch-criteria-industry-v3a',
        extractionSchemaName: 'criteria-industry-v3a',
      }),
    ]);
    expect(recap.schemas).toEqual(['criteria-industry-v3a', 'default']);
    expect(recap.schemasAllDefault).toBe(false);
  });

  it('derives prompt names from variant names and dedupes', () => {
    const recap = summarizeAxes([
      variant({ name: 'gpt-4.1__sys-gate-v8-baseline' }),
      variant({
        name: 'gpt-5__eff-minimal__sys-gate-v8-baseline',
        modelId: 'gpt-5',
        settingName: 'eff-minimal',
      }),
    ]);
    expect(recap.sysPrompts).toEqual(['gate-v8-baseline']);
    expect(recap.models).toEqual(['gpt-4.1', 'gpt-5(eff-minimal)']);
  });

  it('labels a model by the setting NAME, whatever the provider', () => {
    // Un fournisseur libre : le libellé ne dépend ni de reasoningEffort ni du
    // budget de réflexion, seulement du nom déclaré par le modèle.
    const recap = summarizeAxes([
      variant({
        name: 'small__think-4096',
        provider: 'mistral',
        modelId: 'small',
        settingName: 'think-4096',
        setting: { budget: 4096 },
      }),
    ]);
    expect(recap.models).toEqual(['small(think-4096)']);
  });
});
