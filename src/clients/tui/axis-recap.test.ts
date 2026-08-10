import { describe, expect, it } from 'vitest';
import type { EvalVariant } from '@eval/engine/variant';
import { summarizeAxes } from './axis-recap';

const openaiVariant = (over: Partial<EvalVariant> = {}): EvalVariant =>
  ({
    name: 'gpt-4.1',
    provider: 'openai',
    modelId: 'gpt-4.1',
    ...over,
  }) as EvalVariant;

describe('summarizeAxes', () => {
  it('flags the all-default schema shape (the 2026-07-10 incident)', () => {
    const recap = summarizeAxes([
      openaiVariant(),
      { name: 'claude-sonnet-5', provider: 'anthropic', modelId: 'claude-sonnet-5' },
    ]);
    expect(recap.schemas).toEqual(['default']);
    expect(recap.schemasAllDefault).toBe(true);
    expect(recap.sysPrompts).toEqual(['default']);
  });

  it('does not flag when at least one variant carries a schema', () => {
    const recap = summarizeAxes([
      openaiVariant(),
      openaiVariant({
        name: 'gpt-4.1__sys-gate-v8-baseline__sch-criteria-industry-v3a',
        extractionSchemaName: 'criteria-industry-v3a',
      }),
    ]);
    expect(recap.schemas).toEqual(['criteria-industry-v3a', 'default']);
    expect(recap.schemasAllDefault).toBe(false);
  });

  it('derives prompt names from variant names and dedupes', () => {
    const recap = summarizeAxes([
      openaiVariant({ name: 'gpt-4.1__sys-gate-v8-baseline' }),
      openaiVariant({
        name: 'gpt-5__eff-minimal__sys-gate-v8-baseline',
        modelId: 'gpt-5',
        reasoningEffort: 'minimal',
      }),
    ]);
    expect(recap.sysPrompts).toEqual(['gate-v8-baseline']);
    expect(recap.models).toEqual(['gpt-4.1', 'gpt-5(minimal)']);
  });

  it('labels anthropic thinking budgets on the model', () => {
    const recap = summarizeAxes([
      {
        name: 'claude-opus-4-8__think-8192',
        provider: 'anthropic',
        modelId: 'claude-opus-4-8',
        thinkingBudgetTokens: 8192,
      },
    ]);
    expect(recap.models).toEqual(['claude-opus-4-8(think 8192)']);
  });
});
