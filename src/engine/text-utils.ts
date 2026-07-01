const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .trim();

export const tokensOf = (s: string): Set<string> => {
  const normalized = normalizeText(s);
  if (normalized === '') return new Set();
  return new Set(normalized.split(' '));
};

export const tokensInclude = (haystack: string, needle: string): boolean => {
  const needleTokens = tokensOf(needle);
  if (needleTokens.size === 0) return true;
  const haystackTokens = tokensOf(haystack);
  return Array.from(needleTokens).every((t) => haystackTokens.has(t));
};
