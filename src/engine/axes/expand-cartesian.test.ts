import { describe, expect, it } from 'vitest';
import type { AxisInputs } from './axis-inputs';
import { expandCartesian } from './expand-cartesian';

const baseAxes: AxisInputs = {
  models: [],
  reasoningEfforts: ['default'],
  thinkingBudgets: ['default'],
  sysPrompts: ['default'],
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
      });
      expect(variants).toEqual([
        { name: 'gpt-4.1-mini', provider: 'openai', modelId: 'gpt-4.1-mini' },
      ]);
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
