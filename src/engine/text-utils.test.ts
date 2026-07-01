import { describe, expect, it } from 'vitest';
import { normalizeText, tokensInclude, tokensOf } from './text-utils';

describe('normalizeText', () => {
  it('strips diacritics', () => {
    expect(normalizeText('Développeur')).toBe('developpeur');
    expect(normalizeText('Crème brûlée')).toBe('creme brulee');
  });

  it('lowercases', () => {
    expect(normalizeText('PYTHON Developer')).toBe('python developer');
  });

  it('collapses punctuation, emojis, and whitespace', () => {
    expect(normalizeText('Python, Developer 🚀')).toBe('python developer');
    expect(normalizeText('  Senior   Python  Developer  ')).toBe('senior python developer');
    expect(normalizeText('Full-Stack/Python.Developer')).toBe('full stack python developer');
  });

  it('returns empty string for empty/non-alnum input', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('!!!')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('keeps digits', () => {
    expect(normalizeText('Web3 Engineer')).toBe('web3 engineer');
  });
});

describe('tokensOf', () => {
  it('returns a set of normalized tokens', () => {
    expect(tokensOf('Senior Python Developer')).toEqual(new Set(['senior', 'python', 'developer']));
  });

  it('deduplicates tokens', () => {
    expect(tokensOf('Python Python Developer')).toEqual(new Set(['python', 'developer']));
  });

  it('returns empty set for empty input', () => {
    expect(tokensOf('')).toEqual(new Set());
    expect(tokensOf('!!!')).toEqual(new Set());
  });
});

describe('tokensInclude', () => {
  it('matches when haystack contains all needle tokens', () => {
    expect(tokensInclude('Senior Python Developer', 'Python Developer')).toBe(true);
    expect(tokensInclude('Python Developer', 'Python Developer')).toBe(true);
  });

  it('matches case-insensitively and across diacritics', () => {
    expect(tokensInclude('PYTHON DEVELOPER', 'python developer')).toBe(true);
    expect(tokensInclude('Développeur Python', 'developpeur python')).toBe(true);
  });

  it('matches across punctuation and ordering', () => {
    expect(tokensInclude('Python, Developer', 'Python Developer')).toBe(true);
    expect(tokensInclude('Developer Python', 'Python Developer')).toBe(true);
  });

  it('does not match when haystack misses a needle token', () => {
    expect(tokensInclude('Python Developer', 'Senior Python Developer')).toBe(false);
    expect(tokensInclude('Java Developer', 'Python Developer')).toBe(false);
  });

  it('does not bridge translation (FR vs EN words)', () => {
    expect(tokensInclude('Développeur Python', 'Python Developer')).toBe(false);
    expect(tokensInclude('Dev Python', 'Python Developer')).toBe(false);
  });

  it('matches an empty needle (no constraints)', () => {
    expect(tokensInclude('anything', '')).toBe(true);
  });

  it('rejects when haystack is empty but needle is not', () => {
    expect(tokensInclude('', 'Python')).toBe(false);
  });
});
