import type { ModelVariant } from './models/variant';

/**
 * `EvalVariant` — the descriptor of a single LLM call configuration that the
 * eval harness runs and compares. One shape for every model: the provider is a
 * free string and the setting is opaque to the lib (ADR 0001).
 */
export type Provider = string;

export type EvalVariant<TSetting = unknown> = ModelVariant<TSetting>;
