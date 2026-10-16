import type { ModelAxisInputs } from '@undetermini/core/models/expand';
import type { Model } from '@undetermini/core/models/model';

/** Setting names declared by at least one of the models, first seen first. */
export const declaredSettingNames = (
  models: ReadonlyArray<Model>,
): string[] => [
  ...new Set(models.flatMap((model) => Object.keys(model.settings ?? {}))),
];

/** `checked` holds `'default'` and/or declared names. A model keeps only the names
 *  it declares; one left with none runs its variant without a setting. */
export const buildModelEntries = (
  models: ReadonlyArray<Model>,
  checked: ReadonlySet<string>,
): ModelAxisInputs<unknown>['models'] =>
  models.map((model) => {
    const settingNames = [...checked].filter(
      (name) => name === 'default' || name in (model.settings ?? {}),
    );
    return {
      model,
      settingNames: settingNames.length > 0 ? settingNames : ['default'],
    };
  });
