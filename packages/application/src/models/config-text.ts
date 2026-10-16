import type { Model, ModelKey } from '@undetermini/core/models/model';
import { modelKey } from '@undetermini/core/models/model';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const quote = (text: string): string =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const renderKey = (key: string): string =>
  IDENTIFIER.test(key) ? key : quote(key);

const renderValue = (value: unknown): string => {
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return `[${value.map(renderValue).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${renderKey(key)}: ${renderValue(entry)}`,
    );
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }
  return String(value);
};

const renderModel = ({
  model,
  note,
}: {
  model: Model;
  note: string | undefined;
}): string[] => {
  const { provider, id, price, retired, settings } = model;
  const lines = [
    ...(note === undefined ? [] : [`    // ${note}`]),
    '    {',
    `      provider: ${quote(provider)},`,
    `      id: ${quote(id)},`,
    `      price: ${renderValue(price)},`,
  ];
  if (retired === true) lines.push('      retired: true,');
  if (settings !== undefined) {
    lines.push('      settings: {');
    for (const [name, setting] of Object.entries(settings)) {
      lines.push(`        ${renderKey(name)}: ${renderValue(setting)},`);
    }
    lines.push('      },');
  }
  lines.push('    },');
  return lines;
};

/** TypeScript text of the `models: [ … ]` key. `notes` maps a model key to the
 *  one-line reason a flagged model (retired, unpriced) carries as a comment. */
export const renderModelsBlock = (
  models: Model[],
  notes: Partial<Record<ModelKey, string>>,
): string =>
  [
    '  models: [',
    ...models.flatMap((model) =>
      renderModel({ model, note: notes[modelKey(model)] }),
    ),
    '  ],',
  ].join('\n');

export type InsertModelsResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no-define-config' | 'models-present' };

const DEFINE_CONFIG_OPENING = /defineConfig\s*\(\s*\{/;
const MODELS_KEY = /(^|[\s{,])models\s*:/m;

/** The original text, untouched, with `block` inserted right after `defineConfig({`. */
export const insertModels = (
  configText: string,
  block: string,
): InsertModelsResult => {
  const opening = DEFINE_CONFIG_OPENING.exec(configText);
  if (opening === null) return { ok: false, reason: 'no-define-config' };
  if (MODELS_KEY.test(configText)) return { ok: false, reason: 'models-present' };
  const end = opening.index + opening[0].length;
  return {
    ok: true,
    text: `${configText.slice(0, end)}\n${block}${configText.slice(end)}`,
  };
};

/** A complete config for a project that has none. */
export const newConfigText = (block: string): string =>
  [
    "import { defineConfig } from 'undetermini';",
    '',
    'export default defineConfig({',
    '  subjects: {},',
    block,
    '});',
    '',
  ].join('\n');
