import { describe, expect, it } from 'vitest';
import { computeFingerprint } from './fingerprint';

describe('computeFingerprint', () => {
  it('returns a sha1 hex string (40 chars)', () => {
    const fp = computeFingerprint([{ id: 'a', version: 1 }]);
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is stable across permutations of the input', () => {
    const a = computeFingerprint([
      { id: 'b', version: 2 },
      { id: 'a', version: 1 },
      { id: 'c', version: 3 },
    ]);
    const b = computeFingerprint([
      { id: 'a', version: 1 },
      { id: 'c', version: 3 },
      { id: 'b', version: 2 },
    ]);
    expect(a).toBe(b);
  });

  it('changes when a version bumps', () => {
    const a = computeFingerprint([{ id: 'x', version: 1 }]);
    const b = computeFingerprint([{ id: 'x', version: 2 }]);
    expect(a).not.toBe(b);
  });

  it('changes when an assertion is added', () => {
    const a = computeFingerprint([{ id: 'x', version: 1 }]);
    const b = computeFingerprint([
      { id: 'x', version: 1 },
      { id: 'y', version: 1 },
    ]);
    expect(a).not.toBe(b);
  });

  it('empty input is stable', () => {
    expect(computeFingerprint([])).toBe(computeFingerprint([]));
  });
});
