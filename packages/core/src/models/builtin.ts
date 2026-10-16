import { MODEL_CAPABILITIES } from '../axes/model-capabilities';
import { MODEL_PRICING_USD_PER_1M } from '../pricing';
import type { Model, PricePeriod } from './model';

export type BuiltinSetting =
  | { reasoningEffort: string }
  | { thinkingBudgetTokens: number };

// Budgets proposés par la TUI (`COMMON_THINKING_BUDGETS` d'AxesPage.tsx).
const THINKING_BUDGETS = [4096, 8192, 16384, 32768] as const;

const PRICE_FROM = '2000-01-01';

const settingsOf = (
  capability: (typeof MODEL_CAPABILITIES)[string],
): Record<string, BuiltinSetting> | undefined => {
  const settings: Record<string, BuiltinSetting> = {};
  for (const effort of capability.reasoningEffort ?? []) {
    const sent =
      effort === 'minimal' && capability.reasoningEffortMinimalMapsToNone === true
        ? 'none'
        : effort;
    settings[`eff-${effort}`] = { reasoningEffort: sent };
  }
  if (capability.thinking === 'budget') {
    for (const budget of THINKING_BUDGETS) {
      settings[`think-${budget}`] = { thinkingBudgetTokens: budget };
    }
  }
  return Object.keys(settings).length === 0 ? undefined : settings;
};

const priceOf = (id: string): PricePeriod[] => {
  const usd = MODEL_PRICING_USD_PER_1M[id];
  if (usd === undefined) return [];
  return [
    {
      from: PRICE_FROM,
      input: String(usd.input),
      output: String(usd.output),
      cachedInput: String(usd.cachedInput),
    },
  ];
};

/** La liste intégrée, convertie en déclarations. Un id sans capacité n'y entre pas. */
export const builtinModels = (): Model<BuiltinSetting>[] =>
  Object.entries(MODEL_CAPABILITIES).map(([id, capability]) => {
    const settings = settingsOf(capability);
    return {
      provider: capability.provider,
      id,
      price: priceOf(id),
      ...(settings === undefined ? {} : { settings }),
    };
  });
