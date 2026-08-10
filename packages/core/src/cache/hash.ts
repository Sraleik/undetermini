import { createHash } from 'node:crypto';

export const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize((value as Record<string, unknown>)[k]);
      return acc;
    }, {});
};

export const sha256 = (value: unknown): string => {
  const json =
    typeof value === 'string' ? value : JSON.stringify(canonicalize(value));
  return createHash('sha256').update(json).digest('hex');
};
