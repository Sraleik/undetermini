import { describe, expect, it } from 'vitest';
import { computeVariantName } from './variant-name';

describe('computeVariantName', () => {
  describe('given only a modelId', () => {
    it('returns the modelId verbatim', () => {
      expect(computeVariantName({ modelId: 'gpt-5-mini' })).toBe('gpt-5-mini');
    });

    it('preserves dashes inside the modelId', () => {
      expect(computeVariantName({ modelId: 'claude-opus-4-6' })).toBe('claude-opus-4-6');
    });
  });

  describe('given a reasoning effort', () => {
    it('appends an eff- segment', () => {
      expect(computeVariantName({ modelId: 'gpt-5-mini', reasoningEffort: 'high' })).toBe(
        'gpt-5-mini__eff-high',
      );
    });
  });

  describe('given a thinking budget', () => {
    it('appends a think- segment with the numeric value', () => {
      expect(
        computeVariantName({ modelId: 'claude-opus-4-6', thinkingBudgetTokens: 8192 }),
      ).toBe('claude-opus-4-6__think-8192');
    });
  });

  describe('given a sysPromptName', () => {
    it('appends a sys- segment', () => {
      expect(
        computeVariantName({ modelId: 'gpt-5-mini', sysPromptName: 'v2-strict' }),
      ).toBe('gpt-5-mini__sys-v2-strict');
    });
  });

  describe('given multiple axes at once', () => {
    it('orders segments model → eff → sys for OpenAI', () => {
      expect(
        computeVariantName({
          modelId: 'gpt-5-mini',
          reasoningEffort: 'low',
          sysPromptName: 'v2-strict',
        }),
      ).toBe('gpt-5-mini__eff-low__sys-v2-strict');
    });

    it('orders segments model → think → sys for Anthropic', () => {
      expect(
        computeVariantName({
          modelId: 'claude-opus-4-6',
          thinkingBudgetTokens: 4096,
          sysPromptName: 'no-bundles',
        }),
      ).toBe('claude-opus-4-6__think-4096__sys-no-bundles');
    });
  });

  describe('determinism', () => {
    it('returns the same name for the same input', () => {
      const input = {
        modelId: 'gpt-5-mini',
        reasoningEffort: 'medium' as const,
        sysPromptName: 'experiment',
      };
      expect(computeVariantName(input)).toBe(computeVariantName(input));
    });
  });
});
