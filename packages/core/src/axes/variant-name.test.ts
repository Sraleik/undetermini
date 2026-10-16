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

  describe('given a settingName', () => {
    it('appends the setting name right after the id', () => {
      expect(computeVariantName({ modelId: 'gpt-5', settingName: 'eff-low' })).toBe(
        'gpt-5__eff-low',
      );
    });

    it('keeps the setting before sys and sch', () => {
      expect(
        computeVariantName({
          modelId: 'gpt-5',
          settingName: 'eff-low',
          sysPromptName: 'v2',
          schemaName: 'no-criteria',
        }),
      ).toBe('gpt-5__eff-low__sys-v2__sch-no-criteria');
    });
  });

  describe('given a sysPromptName', () => {
    it('appends a sys- segment', () => {
      expect(
        computeVariantName({ modelId: 'gpt-5-mini', sysPromptName: 'v2-strict' }),
      ).toBe('gpt-5-mini__sys-v2-strict');
    });
  });

  describe('given a schemaName', () => {
    it('appends a sch- segment', () => {
      expect(
        computeVariantName({ modelId: 'gpt-4.1', schemaName: 'no-criteria-v1' }),
      ).toBe('gpt-4.1__sch-no-criteria-v1');
    });
  });

  describe('given multiple axes at once', () => {
    it('orders segments model → setting → sys', () => {
      expect(
        computeVariantName({
          modelId: 'claude-opus-4-6',
          settingName: 'think-4096',
          sysPromptName: 'no-bundles',
        }),
      ).toBe('claude-opus-4-6__think-4096__sys-no-bundles');
    });

    it('places sch- last (model → setting → sys → sch)', () => {
      expect(
        computeVariantName({
          modelId: 'gpt-5-mini',
          settingName: 'eff-low',
          sysPromptName: 'v2-strict',
          schemaName: 'no-criteria-v1',
        }),
      ).toBe('gpt-5-mini__eff-low__sys-v2-strict__sch-no-criteria-v1');
    });
  });

  describe('determinism', () => {
    it('returns the same name for the same input', () => {
      const input = {
        modelId: 'gpt-5-mini',
        settingName: 'eff-medium',
        sysPromptName: 'experiment',
      };
      expect(computeVariantName(input)).toBe(computeVariantName(input));
    });
  });
});
