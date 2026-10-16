import type { SchemaAxisValue, SysPromptAxisValue } from '../axes/axis-inputs';
import { computeVariantName } from '../axes/variant-name';
import { modelKey, type Model } from './model';
import type { ModelVariant } from './variant';

export type ModelAxisInputs<TSetting> = {
  models: ReadonlyArray<{
    model: Model<TSetting>;
    /** `'default'` = the variant without a setting. */
    settingNames: ReadonlyArray<string>;
  }>;
  sysPrompts: ReadonlyArray<SysPromptAxisValue>;
  schemas: ReadonlyArray<SchemaAxisValue>;
};

export const expandModels = <TSetting>(
  inputs: ModelAxisInputs<TSetting>,
): ModelVariant<TSetting>[] => {
  const sysPrompts = inputs.sysPrompts.length === 0 ? ['default' as const] : inputs.sysPrompts;
  const schemas = inputs.schemas.length === 0 ? ['default' as const] : inputs.schemas;

  const idCount = new Map<string, number>();
  for (const { model } of inputs.models) {
    idCount.set(model.id, (idCount.get(model.id) ?? 0) + 1);
  }

  const variants: ModelVariant<TSetting>[] = [];
  const seenNames = new Set<string>();

  for (const { model, settingNames } of inputs.models) {
    const nameId = (idCount.get(model.id) ?? 0) > 1 ? modelKey(model) : model.id;

    for (const settingName of settingNames) {
      const declared = settingName === 'default' ? undefined : settingName;
      if (declared !== undefined && !(model.settings && declared in model.settings)) {
        throw new Error(
          `Model ${modelKey(model)} does not declare the setting "${declared}"`,
        );
      }

      for (const sysPrompt of sysPrompts) {
        const sysPromptName = sysPrompt === 'default' ? undefined : sysPrompt.name;
        for (const schema of schemas) {
          const schemaName = schema === 'default' ? undefined : schema.name;
          const name = computeVariantName({
            modelId: nameId,
            settingName: declared,
            sysPromptName,
            schemaName,
          });
          if (seenNames.has(name)) continue;
          seenNames.add(name);
          variants.push({
            name,
            provider: model.provider,
            modelId: model.id,
            ...(declared !== undefined
              ? { settingName: declared, setting: model.settings?.[declared] }
              : {}),
            ...(sysPrompt !== 'default' ? { systemPrompt: sysPrompt.text } : {}),
            ...(schemaName !== undefined ? { extractionSchemaName: schemaName } : {}),
          });
        }
      }
    }
  }

  return variants;
};
