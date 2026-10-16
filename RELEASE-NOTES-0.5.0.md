# undetermini 0.5.0

## Models are declared by the project

A project declares its models under `models` in `undetermini.config.ts`. See
"Declaring your models" in the README. Adding a model no longer needs a release
of the library.

## Breaking changes

* `provider` is a free string. The `Provider` union (`'openai' | 'anthropic' | …`)
  no longer limits it, and the engine never guesses a provider from a model id.
* A model without a provider, a duplicate `provider` + `id` pair and a malformed
  price are refused at load time, naming the model.
* `EvalVariant` takes one shape, `ModelVariant<TSetting>`. The effort and budget
  axes give way to named `settings`.
* The cost of a trial comes from the prices declared by the project. Each run keeps
  a snapshot of those prices. A model without a price has an unknown cost, never zero.

## Contract of every subject

* `provider` is a free string.
* The subject picks its client by provider. A provider it does not serve raises an
  explicit error. There is no "otherwise Anthropic".
* The subject translates `variant.setting` for its route in `buildProviderOptions`,
  for example `{ reasoningEffort: 'low' }` becomes `{ openai: { reasoningEffort: 'low' } }`.

## Migration in two steps

1. 0.5.0: declarations are read, the built-in list is still there and the export
   command ships. A config without `models` uses the built-in list and warns,
   naming `undetermini models export`.
2. 0.6.0: the built-in list leaves the code and becomes a reference page in the
   docs. A config without `models` stops with an error that names the command.

These stay exported in 0.5.0 and are marked `@deprecated`: `getProvider`,
`knownModelIds`, `supportsReasoningEffort`, `supportsThinkingBudget`,
`toOpenAiReasoningEffort`, `computeCost`, `PRICING_VERIFIED_AT`. They go in 0.6.0.

## Packaging

`dinero.js`, which is ESM only, is bundled into `dist/index.cjs`. The CommonJS
barrel loads on any Node 22, and `engines` does not change.
