import { describe, expect, it } from 'vitest';
import type { PricePeriod } from './model';
import { PriceParseError, parsePrice, priceAt, trialCost } from './price';

const period = (overrides: Partial<PricePeriod> = {}): PricePeriod => ({
  from: '2026-01-01',
  input: '1',
  output: '2',
  cachedInput: '0.5',
  ...overrides,
});

describe('parsePrice', () => {
  it('accepts a plain decimal string', () => {
    expect(() => parsePrice({ text: '0.075', field: 'input' })).not.toThrow();
    expect(() => parsePrice({ text: '30', field: 'input' })).not.toThrow();
  });

  // Cas vécu : la virgule française, recopiée de la page d'un fournisseur.
  it.each(['0,075', '', '-1', 'abc', '1e3', ' 1', '1.'])(
    'refuses %j and names the field',
    (text) => {
      const attempt = () => parsePrice({ text, field: 'cachedInput' });
      expect(attempt).toThrow(PriceParseError);
      expect(attempt).toThrow(/cachedInput/);
    },
  );

  it('refuses a price finer than one millionth of a dollar per million tokens', () => {
    expect(() => parsePrice({ text: '0.0000001', field: 'input' })).toThrow(
      PriceParseError,
    );
  });
});

describe('priceAt', () => {
  const intro = period({ from: '2026-07-01', input: '1' });
  const standard = period({ from: '2026-09-01', input: '3' });

  it('returns null before the first period', () => {
    expect(priceAt([intro, standard], '2026-06-30')).toBeNull();
  });

  it('returns null without any period', () => {
    expect(priceAt([], '2026-08-15')).toBeNull();
  });

  it('returns the period in force at the call date', () => {
    expect(priceAt([intro, standard], '2026-08-15')).toBe(intro);
  });

  it('switches on the exact day a period starts', () => {
    expect(priceAt([intro, standard], '2026-09-01')).toBe(standard);
    expect(priceAt([intro, standard], '2026-08-31')).toBe(intro);
  });

  it('does not depend on the order the periods are declared in', () => {
    expect(priceAt([standard, intro], '2026-08-15')).toBe(intro);
  });

  it('keeps the last period open-ended', () => {
    expect(priceAt([intro, standard], '2030-01-01')).toBe(standard);
  });
});

describe('trialCost', () => {
  const base = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

  it('is null without a price', () => {
    expect(
      trialCost({ ...base, periods: [], calledAt: '2026-08-15' }),
    ).toBeNull();
  });

  it('is null when the call predates the first period', () => {
    expect(
      trialCost({
        ...base,
        periods: [period({ from: '2026-09-01' })],
        calledAt: '2026-08-15',
      }),
    ).toBeNull();
  });

  // ISC-11 : 1 000 essais de 1 200 tokens à 0.075 $/M. En flottants, la somme
  // donne 0.09000000000000193 au lieu de 0.09.
  it('sums 1000 trials of 1200 input tokens to exactly 90 000 000 nano-dollars', () => {
    const periods = [period({ input: '0.075' })];
    let total = 0;
    for (let i = 0; i < 1000; i++) {
      total += trialCost({
        ...base,
        periods,
        calledAt: '2026-08-15',
        inputTokens: 1200,
      }) as number;
    }
    expect(total).toBe(90_000_000);
  });

  // ISC-10 : un essai rejoué en octobre garde le tarif de sa date d'appel.
  it('prices at the call date, whatever the clock says', () => {
    const periods = [
      period({ from: '2026-07-01', input: '1' }),
      period({ from: '2026-09-01', input: '3' }),
    ];
    const cost = (calledAt: string) =>
      trialCost({ ...base, periods, calledAt, inputTokens: 1_000_000 });
    expect(cost('2026-08-15')).toBe(1_000_000_000);
    expect(cost('2026-10-02')).toBe(3_000_000_000);
  });

  it('bills uncached input, cached input and output at their own rates', () => {
    const cost = trialCost({
      periods: [period({ input: '2', output: '8', cachedInput: '0.5' })],
      calledAt: '2026-08-15',
      inputTokens: 1_000_000,
      cachedInputTokens: 750_000,
      outputTokens: 500_000,
    });
    // 250k × $2/M + 750k × $0.5/M + 500k × $8/M = 0.5 + 0.375 + 4
    expect(cost).toBe(4_875_000_000);
  });

  it('never bills negative uncached input when cached exceeds input', () => {
    const cost = trialCost({
      periods: [period({ input: '2', cachedInput: '0.5' })],
      calledAt: '2026-08-15',
      inputTokens: 100,
      cachedInputTokens: 200,
      outputTokens: 0,
    });
    // seuls les 200 tokens cachés sont facturés : 200 × 500 nano
    expect(cost).toBe(100_000);
  });

  it('rounds a sub-nano-dollar cost to a whole nano-dollar', () => {
    const cost = trialCost({
      ...base,
      periods: [period({ input: '0.0005' })],
      calledAt: '2026-08-15',
      inputTokens: 3,
    });
    // 3 × 0.5 nano = 1.5 → 2
    expect(cost).toBe(2);
  });

  // Nano-dollars are plain integers: a result that cannot be exact is refused,
  // never silently rounded by the float it would have fallen back to.
  it('refuses a trial whose cost would not be exact', () => {
    expect(() =>
      trialCost({
        ...base,
        periods: [period({ input: '30' })],
        calledAt: '2026-08-15',
        inputTokens: 400_000_000_000,
      }),
    ).toThrow(RangeError);
  });
});
