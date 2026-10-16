/** One price in force from `from` on. Amounts are decimal strings, USD per million tokens. */
export type PricePeriod = {
  /** ISO date `YYYY-MM-DD`. */
  from: string;
  input: string;
  output: string;
  cachedInput: string;
};

export type Model<TSetting = unknown> = {
  provider: string;
  id: string;
  /** Empty means the price is unknown. */
  price: PricePeriod[];
  retired?: true;
  settings?: Record<string, TSetting>;
};

/** `'provider:id'`: the identity of a model. */
export type ModelKey = `${string}:${string}`;

export const modelKey = ({
  provider,
  id,
}: {
  provider: string;
  id: string;
}): ModelKey => `${provider}:${id}`;
