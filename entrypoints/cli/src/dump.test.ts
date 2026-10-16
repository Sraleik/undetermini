import { describe, expect, it } from 'vitest';
import { readPricingTable, readTrialCostNanoUsd } from './dump';

describe('readTrialCostNanoUsd', () => {
  it('lit cost_nano_usd quand il est présent', () => {
    expect(
      readTrialCostNanoUsd({ cost_nano_usd: 1_500, estimated_cost_usd: 9 }),
    ).toBe(1_500);
  });

  it('retombe sur estimated_cost_usd pour une ligne historique', () => {
    expect(
      readTrialCostNanoUsd({ cost_nano_usd: null, estimated_cost_usd: 0.0015 }),
    ).toBe(1_500_000);
  });

  it('garde null quand le prix est inconnu, jamais 0', () => {
    expect(
      readTrialCostNanoUsd({ cost_nano_usd: null, estimated_cost_usd: null }),
    ).toBeNull();
  });

  it('garde un coût réellement nul', () => {
    expect(
      readTrialCostNanoUsd({ cost_nano_usd: 0, estimated_cost_usd: null }),
    ).toBe(0);
  });
});

describe('readPricingTable', () => {
  const periods = [
    { from: '2026-01-01', input: '0.15', output: '0.6', cachedInput: '0.075' },
  ];

  it('rend tel quel le format { version: 2, models }', () => {
    const json = JSON.stringify({ version: 2, models: { 'openai:gpt-5': periods } });
    expect(readPricingTable({ json, startedAt: '2026-10-01T00:00:00.000Z' })).toEqual({
      version: 2,
      models: { 'openai:gpt-5': periods },
    });
  });

  it('ramène l’ancienne table plate au même format, datée du run', () => {
    const json = JSON.stringify({
      'gpt-3.5-turbo': { input: 0.15, output: 0.6, cachedInput: 0.075 },
    });
    expect(readPricingTable({ json, startedAt: '2026-10-01T00:00:00.000Z' })).toEqual({
      version: 2,
      models: {
        'gpt-3.5-turbo': [
          { from: '2026-10-01', input: '0.15', output: '0.6', cachedInput: '0.075' },
        ],
      },
    });
  });

  it('ignore une entrée plate mal formée', () => {
    const json = JSON.stringify({ broken: { input: 'x' } });
    expect(readPricingTable({ json, startedAt: '2026-10-01T00:00:00.000Z' })).toEqual({
      version: 2,
      models: {},
    });
  });
});
