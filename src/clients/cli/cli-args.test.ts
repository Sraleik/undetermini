import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from './cli-args';

describe('parseEvalArgs — cartesian mode', () => {
  describe('given no axis flags', () => {
    it('returns cartesian = null (legacy flow)', () => {
      expect(parseEvalArgs([]).cartesian).toBeNull();
    });

    it('still parses other existing flags', () => {
      const args = parseEvalArgs(['--trial-count=10', '--case-slugs=foo,bar']);
      expect(args.cartesian).toBeNull();
      expect(args.trialCount).toBe(10);
      expect(args.caseSlugs).toEqual(['foo', 'bar']);
    });
  });

  describe('given --models alone', () => {
    it('activates cartesian mode with default-only axes', () => {
      const args = parseEvalArgs(['--models=gpt-4.1-mini']);
      expect(args.cartesian).toEqual({
        models: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
        reasoningEfforts: ['default'],
        thinkingBudgets: ['default'],
        sysPromptTokens: ['default'],
      });
    });

    it('resolves provider per model from the capability matrix', () => {
      const args = parseEvalArgs([
        '--models=gpt-5-mini,claude-opus-4-6',
      ]);
      expect(args.cartesian?.models).toEqual([
        { provider: 'openai', modelId: 'gpt-5-mini' },
        { provider: 'anthropic', modelId: 'claude-opus-4-6' },
      ]);
    });
  });

  describe('given --models with --reasoning-efforts', () => {
    it('parses CSV efforts including the default sentinel', () => {
      const args = parseEvalArgs([
        '--models=gpt-5-mini',
        '--reasoning-efforts=default,low,high',
      ]);
      expect(args.cartesian?.reasoningEfforts).toEqual([
        'default',
        'low',
        'high',
      ]);
    });
  });

  describe('given --models with --thinking-budgets', () => {
    it('parses CSV budgets as numbers plus the default sentinel', () => {
      const args = parseEvalArgs([
        '--models=claude-opus-4-6',
        '--thinking-budgets=default,4096,8192',
      ]);
      expect(args.cartesian?.thinkingBudgets).toEqual(['default', 4096, 8192]);
    });
  });

  describe('given --models with --sys-prompts', () => {
    it('passes the raw sysPrompt tokens through unresolved', () => {
      const args = parseEvalArgs([
        '--models=gpt-4.1-mini',
        '--sys-prompts=default,v2-strict,./custom.md',
      ]);
      expect(args.cartesian?.sysPromptTokens).toEqual([
        'default',
        'v2-strict',
        './custom.md',
      ]);
    });
  });

  describe('given an axis flag without --models', () => {
    it('throws explaining --models is required', () => {
      expect(() => parseEvalArgs(['--reasoning-efforts=low'])).toThrow(
        /require --models/,
      );
    });

    it('throws for --thinking-budgets without --models', () => {
      expect(() => parseEvalArgs(['--thinking-budgets=4096'])).toThrow(
        /require --models/,
      );
    });

    it('throws for --sys-prompts without --models', () => {
      expect(() => parseEvalArgs(['--sys-prompts=v2-strict'])).toThrow(
        /require --models/,
      );
    });
  });

  describe('given an unknown model in --models', () => {
    it('throws listing known models and the capability matrix path', () => {
      expect(() =>
        parseEvalArgs(['--models=gpt-99-imaginary']),
      ).toThrow(/unknown model 'gpt-99-imaginary'/);
    });
  });

  describe('given an invalid reasoning effort value', () => {
    it('throws listing allowed values', () => {
      expect(() =>
        parseEvalArgs([
          '--models=gpt-5-mini',
          '--reasoning-efforts=bogus',
        ]),
      ).toThrow(/invalid value 'bogus'/);
    });
  });

  describe('given an invalid thinking budget value', () => {
    it('throws on non-positive integers', () => {
      expect(() =>
        parseEvalArgs([
          '--models=claude-opus-4-6',
          '--thinking-budgets=0',
        ]),
      ).toThrow(/invalid value '0'/);
    });

    it('throws on non-integer values', () => {
      expect(() =>
        parseEvalArgs([
          '--models=claude-opus-4-6',
          '--thinking-budgets=4096.5',
        ]),
      ).toThrow(/invalid value '4096\.5'/);
    });
  });
});

