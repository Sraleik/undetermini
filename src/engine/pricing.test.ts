import { describe, expect, it } from 'vitest';
import { MODEL_PRICING_USD_PER_1M, computeCost } from './pricing';

describe('computeCost', () => {
  it('returns null for an unknown model', () => {
    expect(computeCost('not-a-model', 1000, 1000)).toBeNull();
  });

  it('no cached tokens → byte-identical to the legacy input+output formula', () => {
    // gpt-4.1: input $2.00, output $8.00 per 1M.
    const cost = computeCost('gpt-4.1', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.0 + 8.0, 10);
  });

  it('default cachedInputTokens=0 matches the 3-arg call exactly', () => {
    const a = computeCost('gpt-4o-mini', 12_345, 678);
    const b = computeCost('gpt-4o-mini', 12_345, 678, 0);
    expect(a).toBe(b);
  });

  it('all input cached → billed at cachedInput rate', () => {
    // gpt-4.1: cachedInput $0.50/1M. 1M cached input + 0 output.
    expect(computeCost('gpt-4.1', 1_000_000, 0, 1_000_000)).toBeCloseTo(0.5, 10);
  });

  it('partial cached → split between input and cachedInput rates', () => {
    // gpt-4.1: 1M input total, 0.75M cached. uncached 0.25M @ $2 = $0.50;
    // cached 0.75M @ $0.50 = $0.375; output 0.5M @ $8 = $4.
    const cost = computeCost('gpt-4.1', 1_000_000, 500_000, 750_000);
    expect(cost).toBeCloseTo(0.5 + 0.375 + 4.0, 10);
  });

  it('clamps uncached at 0 when cachedInputTokens exceeds inTokens', () => {
    // 100 input, 200 "cached" (inconsistent) → uncached clamps to 0; only the
    // 200 cached tokens are billed at cachedInput, never a negative input bill.
    const cost = computeCost('gpt-4.1', 100, 0, 200);
    expect(cost).toBeCloseTo((200 / 1_000_000) * 0.5, 12);
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('every model entry carries a cachedInput ≤ input', () => {
    for (const [model, p] of Object.entries(MODEL_PRICING_USD_PER_1M)) {
      expect(p.cachedInput, model).toBeLessThanOrEqual(p.input);
      expect(p.cachedInput, model).toBeGreaterThan(0);
    }
  });
});
