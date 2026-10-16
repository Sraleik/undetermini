import {
  type Dinero,
  add,
  dinero,
  halfUp,
  multiply,
  toSnapshot,
  transformScale,
} from 'dinero.js';
import type { PricePeriod } from './model';

// A price is USD per million tokens; the unit held here is USD per token, to
// the picodollar (10^-12). That is exactly six decimals of the declared price,
// so any declared price within that precision is an integer amount.
const PER_TOKEN_USD = { code: 'USD', base: 10, exponent: 12 } as const;
const NANO_EXPONENT = 9;
const DECLARED_DECIMALS = 6;

export class PriceParseError extends Error {
  constructor(
    readonly field: string,
    readonly text: string,
    reason: string,
  ) {
    super(`Prix invalide pour « ${field} » (${JSON.stringify(text)}) : ${reason}`);
    this.name = 'PriceParseError';
  }
}

/** Decimal string, USD per million tokens → exact amount. */
export const parsePrice = ({
  text,
  field,
}: {
  text: string;
  field: string;
}): Dinero<number> => {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (match === null) {
    throw new PriceParseError(
      field,
      text,
      'attendu : un nombre décimal avec un point, par exemple "0.075"',
    );
  }
  const [, whole, fraction = ''] = match;
  const amount = Number(whole + fraction.padEnd(DECLARED_DECIMALS, '0'));
  if (!Number.isSafeInteger(amount)) {
    throw new PriceParseError(field, text, 'montant trop grand');
  }
  return dinero({ amount, currency: PER_TOKEN_USD });
};

/** The period in force on `calledAt` (`YYYY-MM-DD`): the latest one starting on or before it. */
export const priceAt = (
  periods: PricePeriod[],
  calledAt: string,
): PricePeriod | null => {
  let inForce: PricePeriod | null = null;
  for (const period of periods) {
    if (period.from > calledAt) continue;
    if (inForce === null || period.from > inForce.from) inForce = period;
  }
  return inForce;
};

const exactAmount = (money: Dinero<number>): number => {
  const { amount } = toSnapshot(money);
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(
      `Coût inexact : ${amount} dépasse la plage des entiers sûrs`,
    );
  }
  return amount;
};

const bill = (rate: Dinero<number>, tokens: number): Dinero<number> => {
  const billed = multiply(rate, tokens);
  exactAmount(billed);
  return billed;
};

/** Whole nano-dollars, or `null` when no period is in force. */
export const trialCost = ({
  periods,
  calledAt,
  inputTokens,
  outputTokens,
  cachedInputTokens,
}: {
  periods: PricePeriod[];
  calledAt: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}): number | null => {
  const period = priceAt(periods, calledAt);
  if (period === null) return null;
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const total = [
    bill(parsePrice({ text: period.input, field: 'input' }), uncachedInputTokens),
    bill(
      parsePrice({ text: period.cachedInput, field: 'cachedInput' }),
      cachedInputTokens,
    ),
    bill(parsePrice({ text: period.output, field: 'output' }), outputTokens),
  ].reduce((sum, part) => add(sum, part));
  exactAmount(total);
  return exactAmount(transformScale(total, NANO_EXPONENT, halfUp));
};
