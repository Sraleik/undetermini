export type ModelVariant<TSetting = unknown> = {
  name: string;
  provider: string;
  modelId: string;
  settingName?: string;
  setting?: TSetting;
  systemPrompt?: string;
  extractionSchemaName?: string;
};
