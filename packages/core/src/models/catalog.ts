import { type Model, type PricePeriod, modelKey } from './model';
import { PriceParseError, parsePrice } from './price';

export type ResolvedRef =
  | { ok: true; model: Model }
  | { ok: false; error: string };

export type Catalog = {
  models: Model[];
  find: (provider: string, id: string) => Model | undefined;
  resolveRef: (ref: string) => ResolvedRef;
};

export type DecodeResult =
  | { ok: true; catalog: Catalog; warnings: string[] }
  | { ok: false; errors: string[] };

const ONE_OFF_PROVIDER = 'openrouter';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

const labelOf = (entry: Record<string, unknown>, rank: number): string => {
  if (!isNonEmptyString(entry.id)) return `modèle n°${rank + 1}`;
  return isNonEmptyString(entry.provider)
    ? modelKey({ provider: entry.provider, id: entry.id })
    : entry.id;
};

const decodePrice = (
  raw: unknown,
): { periods: PricePeriod[] } | { errors: string[] } => {
  if (raw === undefined) return { periods: [] };
  if (!Array.isArray(raw)) return { errors: ['price : une liste de périodes est attendue'] };
  const errors: string[] = [];
  const periods: PricePeriod[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`price[${index}] : une période est attendue`);
      return;
    }
    if (!isNonEmptyString(entry.from)) {
      errors.push(`price[${index}].from : une date AAAA-MM-JJ est attendue`);
      return;
    }
    const amounts: Record<string, string> = {};
    for (const field of ['input', 'output', 'cachedInput'] as const) {
      const text = entry[field];
      const path = `price[${index}].${field}`;
      if (typeof text !== 'string') {
        errors.push(`${path} : une chaîne décimale est attendue`);
        continue;
      }
      try {
        parsePrice({ text, field: path });
        amounts[field] = text;
      } catch (error) {
        if (!(error instanceof PriceParseError)) throw error;
        errors.push(error.message);
      }
    }
    if (Object.keys(amounts).length === 3) {
      periods.push({
        from: entry.from,
        input: amounts.input,
        output: amounts.output,
        cachedInput: amounts.cachedInput,
      });
    }
  });
  const seen = new Set<string>();
  for (const { from } of periods) {
    if (seen.has(from)) errors.push(`price : deux périodes commencent le ${from}`);
    seen.add(from);
  }
  if (errors.length > 0) return { errors };
  return { periods: periods.sort((a, b) => a.from.localeCompare(b.from)) };
};

const buildCatalog = (models: Model[]): Catalog => {
  const find = (provider: string, id: string) =>
    models.find((model) => model.provider === provider && model.id === id);

  const resolveRef = (ref: string): ResolvedRef => {
    const colon = ref.indexOf(':');
    if (colon === -1) {
      const candidates = models.filter((model) => model.id === ref);
      if (candidates.length === 1) return { ok: true, model: candidates[0] };
      if (candidates.length === 0) {
        return { ok: false, error: `Modèle « ${ref} » non déclaré.` };
      }
      return {
        ok: false,
        error: `« ${ref} » est ambigu : ${candidates.map(modelKey).join(', ')}.`,
      };
    }
    const provider = ref.slice(0, colon);
    const id = ref.slice(colon + 1);
    const declared = find(provider, id);
    if (declared !== undefined) return { ok: true, model: declared };
    if (provider === ONE_OFF_PROVIDER && id !== '') {
      return { ok: true, model: { provider, id, price: [] } };
    }
    return { ok: false, error: `Modèle « ${ref} » non déclaré.` };
  };

  return { models, find, resolveRef };
};

/** Hand-written decoder: `settings` is checked for shape only, never inspected (ADR 0001). */
export const decodeCatalog = (raw: unknown): DecodeResult => {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: ['Les modèles se déclarent dans une liste.'] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const models: Model[] = [];
  const declared = new Set<string>();

  raw.forEach((entry, rank) => {
    if (!isRecord(entry)) {
      errors.push(`modèle n°${rank + 1} : un objet est attendu`);
      return;
    }
    const label = labelOf(entry, rank);
    const problems: string[] = [];
    if (!isNonEmptyString(entry.provider)) {
      problems.push('provider : obligatoire, jamais deviné');
    }
    if (!isNonEmptyString(entry.id)) problems.push('id : obligatoire');
    if (entry.settings !== undefined && !isRecord(entry.settings)) {
      problems.push('settings : un objet de réglages nommés est attendu');
    }
    const price = decodePrice(entry.price);
    if ('errors' in price) problems.push(...price.errors);

    if (isNonEmptyString(entry.provider) && isNonEmptyString(entry.id)) {
      const key = modelKey({ provider: entry.provider, id: entry.id });
      if (declared.has(key)) problems.push('déclaré deux fois');
      declared.add(key);
    }

    if (problems.length > 0 || 'errors' in price) {
      errors.push(...problems.map((problem) => `${label} — ${problem}`));
      return;
    }

    const model: Model = {
      provider: entry.provider as string,
      id: entry.id as string,
      price: price.periods,
    };
    if (entry.retired === true) model.retired = true;
    if (entry.settings !== undefined) {
      model.settings = entry.settings as Record<string, unknown>;
    }
    if (model.price.length === 0) warnings.push(`${label} — prix inconnu`);
    models.push(model);
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, catalog: buildCatalog(models), warnings };
};
