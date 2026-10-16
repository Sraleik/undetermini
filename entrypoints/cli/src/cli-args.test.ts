import { describe, expect, it } from 'vitest';
import { decodeCatalog } from '@undetermini/core/models/catalog';
import { parseEvalArgs } from './cli-args';

const catalogOf = (raw: unknown[]) => {
  const decoded = decodeCatalog(raw);
  if (!decoded.ok) throw new Error(decoded.errors.join('; '));
  return decoded.catalog;
};

const price = [
  { from: '2026-01-01', input: '1', output: '2', cachedInput: '0.5' },
];

const catalog = catalogOf([
  {
    provider: 'openai',
    id: 'gpt-5',
    price,
    settings: {
      'eff-low': { reasoningEffort: 'low' },
      'eff-high': { reasoningEffort: 'high' },
    },
  },
  {
    provider: 'anthropic',
    id: 'claude-x',
    price,
    settings: {
      'think-4096': { thinkingBudgetTokens: 4096 },
      'think-8192': { thinkingBudgetTokens: 8192 },
    },
  },
  { provider: 'mistral', id: 'mistral-x', price },
  { provider: 'openai', id: 'twin', price },
  { provider: 'azure', id: 'twin', price },
]);

const parse = (...argv: string[]) => parseEvalArgs(argv, catalog);

describe('parseEvalArgs — mode cartésien', () => {
  describe('sans flag d’axe', () => {
    it('rend cartesian = null (variantes statiques du sujet)', () => {
      expect(parse().cartesian).toBeNull();
    });

    it('lit toujours les autres flags', () => {
      const args = parse('--trial-count=10', '--case-slugs=foo,bar');
      expect(args.cartesian).toBeNull();
      expect(args.trialCount).toBe(10);
      expect(args.caseSlugs).toEqual(['foo', 'bar']);
    });
  });

  describe('--models résolu par la config', () => {
    it('accepte un fournisseur libre déclaré (mistral:x)', () => {
      const args = parse('--models=mistral:mistral-x');
      expect(args.cartesian?.entries.map((e) => e.model.provider)).toEqual([
        'mistral',
      ]);
    });

    it('accepte l’id seul quand il est unique', () => {
      const args = parse('--models=gpt-5,claude-x');
      expect(
        args.cartesian?.entries.map((e) => `${e.model.provider}:${e.model.id}`),
      ).toEqual(['openai:gpt-5', 'anthropic:claude-x']);
    });

    it('refuse un id ambigu en listant les candidats', () => {
      expect(() => parse('--models=twin')).toThrow(/openai:twin.*azure:twin/);
    });

    it('voit un modèle ajouté à la config sans toucher à la lib (ISC-9)', () => {
      const extended = catalogOf([
        ...catalog.models,
        { provider: 'acme', id: 'brand-new', price },
      ]);
      const args = parseEvalArgs(['--models=acme:brand-new'], extended);
      expect(args.cartesian?.entries[0]?.model.id).toBe('brand-new');
    });

    it('garde ouvert openrouter:<id> sans déclaration, slash compris', () => {
      const args = parse('--models=openrouter:deepseek/deepseek-chat');
      expect(args.cartesian?.entries[0]?.model).toMatchObject({
        provider: 'openrouter',
        id: 'deepseek/deepseek-chat',
        price: [],
      });
    });

    it('refuse openrouter: sans id', () => {
      expect(() => parse('--models=openrouter:')).toThrow(/non déclaré/);
    });

    it('liste les paires déclarées et nomme la config pour un modèle inconnu', () => {
      const attempt = () => parse('--models=gpt-99-imaginary');
      expect(attempt).toThrow(/gpt-99-imaginary/);
      expect(attempt).toThrow(/openai:gpt-5/);
      expect(attempt).toThrow(/undetermini\.config\.ts/);
      expect(attempt).not.toThrow(/MODEL_CAPABILITIES/);
    });
  });

  describe('--settings', () => {
    it('donne à chaque modèle les noms qu’il déclare', () => {
      const args = parse(
        '--models=gpt-5,claude-x',
        '--settings=eff-low,think-4096',
      );
      expect(args.cartesian?.entries.map((e) => e.settingNames)).toEqual([
        ['eff-low'],
        ['think-4096'],
      ]);
    });

    it('sans --settings, seule la variante sans réglage', () => {
      const args = parse('--models=gpt-5');
      expect(args.cartesian?.entries[0]?.settingNames).toEqual(['default']);
    });

    it('accepte default pour garder la variante sans réglage', () => {
      const args = parse('--models=gpt-5', '--settings=default,eff-high');
      expect(args.cartesian?.entries[0]?.settingNames).toEqual([
        'default',
        'eff-high',
      ]);
    });

    it('refuse un nom qu’aucun modèle choisi ne déclare, en le nommant', () => {
      expect(() => parse('--models=gpt-5', '--settings=think-4096')).toThrow(
        /think-4096/,
      );
    });

    it('exige --models', () => {
      expect(() => parse('--settings=eff-low')).toThrow(/require --models/);
    });
  });

  describe('anciens flags', () => {
    it('refuse --reasoning-efforts en pointant --settings', () => {
      expect(() =>
        parse('--models=gpt-5', '--reasoning-efforts=low'),
      ).toThrow(/--settings/);
    });

    it('refuse --thinking-budgets en pointant --settings', () => {
      expect(() =>
        parse('--models=claude-x', '--thinking-budgets=4096'),
      ).toThrow(/--settings/);
    });
  });

  describe('--sys-prompts et --schemas', () => {
    it('passent les jetons bruts sans les résoudre', () => {
      const args = parse(
        '--models=gpt-5',
        '--sys-prompts=default,v2-strict',
        '--schemas=default,no-criteria-v1',
      );
      expect(args.cartesian?.sysPromptTokens).toEqual(['default', 'v2-strict']);
      expect(args.cartesian?.schemaTokens).toEqual([
        'default',
        'no-criteria-v1',
      ]);
    });

    it('exigent --models', () => {
      expect(() => parse('--schemas=no-criteria-v1')).toThrow(/require --models/);
      expect(() => parse('--sys-prompts=v2-strict')).toThrow(/require --models/);
    });
  });
});
