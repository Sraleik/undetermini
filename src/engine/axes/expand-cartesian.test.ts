import { describe, expect, it } from 'vitest';
import type { AxisInputs } from './axis-inputs';
import { expandCartesian, expandCartesianDetailed } from './expand-cartesian';

const baseAxes: AxisInputs = {
  models: [],
  reasoningEfforts: ['default'],
  thinkingBudgets: ['default'],
  sysPrompts: ['default'],
  schemas: ['default'],
};

describe('expandCartesian', () => {
  describe('given no models', () => {
    it('returns an empty array', () => {
      expect(expandCartesian(baseAxes)).toEqual([]);
    });
  });

  describe('given a single OpenAI model with all defaults', () => {
    it('produces one baseline variant', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
      });
      expect(variants).toEqual([
        { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
      ]);
    });
  });

  describe('given a single Anthropic model with all defaults', () => {
    it('produces one baseline variant', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'anthropic', modelId: 'claude-opus-4-6' }],
      });
      expect(variants).toEqual([
        { name: 'claude-opus-4-6', provider: 'anthropic', modelId: 'claude-opus-4-6' },
      ]);
    });
  });

  describe('given a reasoning model and multiple effort values', () => {
    it('produces one variant per effort plus the default', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-5-mini' }],
        reasoningEfforts: ['default', 'low', 'high'],
      });
      expect(variants.map((v) => v.name)).toEqual([
        'gpt-5-mini',
        'gpt-5-mini__eff-low',
        'gpt-5-mini__eff-high',
      ]);
    });
  });

  describe('given a non-reasoning OpenAI model with effort values', () => {
    it('skips non-default effort combos (capability matrix)', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        reasoningEfforts: ['default', 'low', 'high'],
      });
      expect(variants.map((v) => v.name)).toEqual(['gpt-4.1-mini']);
    });
  });

  describe('given an Anthropic model that supports budget_tokens', () => {
    it('produces one variant per budget plus the default', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'anthropic', modelId: 'claude-opus-4-6' }],
        thinkingBudgets: ['default', 4096, 8192],
      });
      expect(variants.map((v) => v.name)).toEqual([
        'claude-opus-4-6',
        'claude-opus-4-6__think-4096',
        'claude-opus-4-6__think-8192',
      ]);
    });
  });

  describe('given Claude Opus 4.7 with thinking budgets', () => {
    it('skips non-default budget combos (adaptive thinking only)', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'anthropic', modelId: 'claude-opus-4-7' }],
        thinkingBudgets: ['default', 4096, 8192],
      });
      expect(variants.map((v) => v.name)).toEqual(['claude-opus-4-7']);
    });
  });

  describe('given an OpenAI model with a sysPrompt override', () => {
    it('injects systemPrompt and adds a sys- segment to the name', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        sysPrompts: ['default', { name: 'v2-strict', text: 'OVERRIDE TEXT' }],
      });
      expect(variants).toEqual([
        { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
        {
          name: 'gpt-4.1-mini__sys-v2-strict',
          provider: 'openai',
          modelId: 'gpt-4.1-mini',
          systemPrompt: 'OVERRIDE TEXT',
        },
      ]);
    });
  });

  describe('given OpenAI + Anthropic models with cross-provider axes', () => {
    it('iterates each model over only its provider-specific axis', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [
          { provider: 'openai', modelId: 'gpt-5-mini' },
          { provider: 'anthropic', modelId: 'claude-opus-4-6' },
        ],
        reasoningEfforts: ['default', 'low'],
        thinkingBudgets: ['default', 4096],
      });
      expect(variants.map((v) => v.name)).toEqual([
        'gpt-5-mini',
        'gpt-5-mini__eff-low',
        'claude-opus-4-6',
        'claude-opus-4-6__think-4096',
      ]);
    });
  });

  describe('given empty per-axis arrays', () => {
    it('defaults each empty axis to ["default"]', () => {
      const variants = expandCartesian({
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        reasoningEfforts: [],
        thinkingBudgets: [],
        sysPrompts: [],
        schemas: [],
      });
      expect(variants).toEqual([
        { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
      ]);
    });
  });

  describe('given an OpenAI model with a schema override', () => {
    it('injects extractionSchemaName and adds a sch- segment to the name', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        schemas: ['default', { name: 'no-criteria-v1' }],
      });
      expect(variants).toEqual([
        { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
        {
          name: 'gpt-4.1-mini__sch-no-criteria-v1',
          provider: 'openai',
          modelId: 'gpt-4.1-mini',
          extractionSchemaName: 'no-criteria-v1',
        },
      ]);
    });
  });

  describe('given sysPrompt AND schema overrides', () => {
    it('orders the segments sys → sch and crosses the two axes', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        sysPrompts: ['default', { name: 'v2', text: 'X' }],
        schemas: ['default', { name: 'no-criteria-v1' }],
      });
      expect(variants.map((v) => v.name)).toEqual([
        'gpt-4.1-mini',
        'gpt-4.1-mini__sch-no-criteria-v1',
        'gpt-4.1-mini__sys-v2',
        'gpt-4.1-mini__sys-v2__sch-no-criteria-v1',
      ]);
    });
  });

  describe('dropped combos (expandCartesianDetailed)', () => {
    it('reports the combo that erased gpt-4.1 (only an unsupported effort checked)', () => {
      const { variants, dropped } = expandCartesianDetailed({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        reasoningEfforts: ['low'],
      });
      expect(variants).toEqual([]);
      expect(dropped).toEqual([
        {
          modelId: 'gpt-4.1-mini',
          axis: 'eff',
          value: 'low',
          reason: 'model does not support reasoning_effort',
        },
      ]);
    });

    it('dedupes a drop across sysPrompt × schema turns', () => {
      const { dropped } = expandCartesianDetailed({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        reasoningEfforts: ['default', 'low'],
        sysPrompts: ['default', { name: 'v2', text: 'X' }],
        schemas: ['default', { name: 'no-criteria-v1' }],
      });
      expect(dropped).toHaveLength(1);
    });

    it('reports think drops for adaptive-only Anthropic models', () => {
      const { dropped } = expandCartesianDetailed({
        ...baseAxes,
        models: [{ provider: 'anthropic', modelId: 'claude-opus-4-7' }],
        thinkingBudgets: ['default', 4096],
      });
      expect(dropped).toEqual([
        {
          modelId: 'claude-opus-4-7',
          axis: 'think',
          value: '4096',
          reason: 'model does not support thinking budget_tokens',
        },
      ]);
    });

    it('reports nothing when every combo is valid — cross-provider values included', () => {
      const { dropped } = expandCartesianDetailed({
        ...baseAxes,
        models: [
          { provider: 'openai', modelId: 'gpt-5-mini' },
          { provider: 'anthropic', modelId: 'claude-opus-4-6' },
          { provider: 'google', modelId: 'gemini-3.5-flash' },
        ],
        reasoningEfforts: ['default', 'low'],
        thinkingBudgets: ['default', 4096],
      });
      expect(dropped).toEqual([]);
    });

    it('expandCartesian stays the detailed expansion minus the report', () => {
      const axes: AxisInputs = {
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-5-mini' }],
        reasoningEfforts: ['default', 'low'],
      };
      expect(expandCartesian(axes)).toEqual(expandCartesianDetailed(axes).variants);
    });
  });

  describe('given the full cartesian (model × effort × sys)', () => {
    it('produces all valid combinations with correct names', () => {
      const variants = expandCartesian({
        ...baseAxes,
        models: [{ provider: 'openai', modelId: 'gpt-5-mini' }],
        reasoningEfforts: ['default', 'medium'],
        sysPrompts: ['default', { name: 'v2', text: 'X' }],
      });
      expect(variants.map((v) => v.name)).toEqual([
        'gpt-5-mini',
        'gpt-5-mini__eff-medium',
        'gpt-5-mini__sys-v2',
        'gpt-5-mini__eff-medium__sys-v2',
      ]);
    });
  });
});
