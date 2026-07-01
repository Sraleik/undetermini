export const pct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

export const usd = (n: number, dp = 4): string => `$${n.toFixed(dp)}`;

export const ms = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
