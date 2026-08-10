import { describe, expect, it } from 'vitest';
import { cycleListIndex } from './cycle-index';

describe('cycleListIndex', () => {
  it('wraps from first to last on up', () => {
    expect(cycleListIndex(0, -1, 5)).toBe(4);
  });

  it('wraps from last to first on down', () => {
    expect(cycleListIndex(4, 1, 5)).toBe(0);
  });

  it('returns 0 for empty lists', () => {
    expect(cycleListIndex(3, 1, 0)).toBe(0);
  });
});
