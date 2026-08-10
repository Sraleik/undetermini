import { createHash } from 'node:crypto';

export type AssertionRef = { id: string; version: number };

// Stable across permutations: sort by id (string lex) before hashing. Two runs
// with the same set of (id, version) pairs produce the same fingerprint
// regardless of declaration order in the case file.
export const computeFingerprint = (refs: AssertionRef[]): string => {
  const sorted = [...refs]
    .map((r) => ({ id: r.id, version: r.version }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash('sha1').update(JSON.stringify(sorted)).digest('hex');
};
