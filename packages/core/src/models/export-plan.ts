import { type BuiltinSetting } from './builtin';
import { type Model, type ModelKey, type PricePeriod, modelKey } from './model';

export type TriedModel = {
  provider: string;
  modelId: string;
  /** Variant names seen in the history, e.g. `x__think-4096__sys-v2`. */
  variantNames: string[];
  /** Last known price of the model; `[]` when none was recorded. */
  lastPrice: PricePeriod[];
};

export type ExportFlag = { key: ModelKey; reason: 'retired' | 'unpriced' };

export type ExportPlan = {
  models: Model<BuiltinSetting>[];
  flagged: ExportFlag[];
};

const EFFORT_SEGMENT = /__eff-([a-z0-9]+)/;
const THINK_SEGMENT = /__think-(\d+)/;

/** Settings the lib generated into variant names; a free-form name yields none. */
const settingsFromVariantNames = (
  variantNames: string[],
): Record<string, BuiltinSetting> | undefined => {
  const settings: Record<string, BuiltinSetting> = {};
  for (const name of variantNames) {
    const effort = EFFORT_SEGMENT.exec(name)?.[1];
    if (effort !== undefined) {
      settings[`eff-${effort}`] = { reasoningEffort: effort };
    }
    const budget = THINK_SEGMENT.exec(name)?.[1];
    if (budget !== undefined) {
      settings[`think-${budget}`] = { thinkingBudgetTokens: Number(budget) };
    }
  }
  return Object.keys(settings).length === 0 ? undefined : settings;
};

const STARTER_BUDGETS = [1024, 4096];

const starterPair = (
  builtin: Model<BuiltinSetting>[],
): Model<BuiltinSetting>[] => {
  const find = (id: string) => builtin.find((m) => m.id === id);
  const gpt = find('gpt-5.4-mini');
  const haiku = find('claude-haiku-4-5');
  if (gpt === undefined || haiku === undefined) {
    throw new Error(
      'La paire de démarrage (gpt-5.4-mini, claude-haiku-4-5) manque dans la liste intégrée',
    );
  }
  const settings = Object.fromEntries(
    STARTER_BUDGETS.map((n) => [`think-${n}`, { thinkingBudgetTokens: n }]),
  );
  return [gpt, { ...haiku, settings }];
};

export const planExport = ({
  tried,
  builtin,
}: {
  tried: TriedModel[];
  builtin: Model<BuiltinSetting>[];
}): ExportPlan => {
  if (tried.length === 0) return { models: starterPair(builtin), flagged: [] };

  const models: Model<BuiltinSetting>[] = [];
  const flagged: ExportFlag[] = [];
  for (const { provider, modelId: id, variantNames, lastPrice } of tried) {
    const key = modelKey({ provider, id });
    const listed = builtin.find((m) => modelKey(m) === key);
    if (listed !== undefined) {
      models.push(listed);
      continue;
    }
    if (provider === 'openrouter') {
      models.push({ provider, id, price: [] });
      flagged.push({ key, reason: 'unpriced' });
      continue;
    }
    const settings = settingsFromVariantNames(variantNames);
    models.push({
      provider,
      id,
      price: lastPrice,
      retired: true,
      ...(settings === undefined ? {} : { settings }),
    });
    flagged.push({ key, reason: 'retired' });
  }
  return { models, flagged };
};
