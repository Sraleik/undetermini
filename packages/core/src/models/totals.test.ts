import { describe, expect, it } from 'vitest';
import type { ModelKey } from './model';
import { type TrialStatus, formatUsd, successRate, sumCosts } from './totals';

const trial = (
  model: ModelKey,
  costNanoUsd: number | null,
  status: TrialStatus = 'success',
) => ({ model, costNanoUsd, status });

describe('sumCosts', () => {
  it('adds the priced trials', () => {
    expect(
      sumCosts([trial('openai:a', 90_000), trial('openai:a', 10)]),
    ).toEqual({ nanoUsd: 90_010, unpricedModels: [] });
  });

  // Cas vécu : un essai sans prix ne coûte pas zéro, il coûte « inconnu ».
  it('names the unpriced model and keeps the total partial', () => {
    expect(
      sumCosts([trial('openai:a', 500), trial('mistral:large', null)]),
    ).toEqual({ nanoUsd: 500, unpricedModels: ['mistral:large'] });
  });

  it('names a model once however many of its trials are unpriced', () => {
    const { unpricedModels } = sumCosts([
      trial('mistral:large', null),
      trial('mistral:large', null),
    ]);
    expect(unpricedModels).toEqual(['mistral:large']);
  });

  it('ignores an unavailable trial, priced or not', () => {
    expect(
      sumCosts([
        trial('openai:a', 500),
        trial('openai:old', null, 'unavailable'),
        trial('openai:old', 99, 'unavailable'),
      ]),
    ).toEqual({ nanoUsd: 500, unpricedModels: [] });
  });

  it('counts a failed trial: it was paid for', () => {
    expect(sumCosts([trial('openai:a', 70, 'fail')]).nanoUsd).toBe(70);
  });

  it('is an empty total, not a partial one, without trials', () => {
    expect(sumCosts([])).toEqual({ nanoUsd: 0, unpricedModels: [] });
  });

  it('refuses a total that would not be exact', () => {
    expect(() =>
      sumCosts([
        trial('openai:a', Number.MAX_SAFE_INTEGER),
        trial('openai:a', 1),
      ]),
    ).toThrow(RangeError);
  });
});

describe('successRate', () => {
  it('leaves unavailable trials out of the denominator', () => {
    const statuses: TrialStatus[] = [
      ...Array<TrialStatus>(7).fill('success'),
      ...Array<TrialStatus>(3).fill('unavailable'),
    ];
    expect(successRate(statuses)).toBe(1);
  });

  it('counts a failure against the rate', () => {
    expect(successRate(['success', 'fail', 'unavailable'])).toBe(0.5);
  });

  it('is null when no trial counts', () => {
    expect(successRate([])).toBeNull();
    expect(successRate(['unavailable'])).toBeNull();
  });
});

describe('formatUsd', () => {
  it('shows dollars to four decimals', () => {
    expect(formatUsd(90_000_000)).toBe('$0.0900');
    expect(formatUsd(1_234_567_890)).toBe('$1.2346');
  });
});
