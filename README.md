# undetermini

An eval harness for **non-deterministic code** — the kind whose output you
can't assert with `===` because it comes from an LLM (sampling, ranking,
classification, extraction…).

<p align="center">
  <img src="./assets/tui-example.png" width="820" alt="undetermini TUI — variants compared across score, pass-rate, cost and latency" />
  <br/>
  <em>The <code>npm run eval:tui</code> results grid: variants (model × system-prompt × reasoning) ranked by score, with cost, latency and cache hits.</em>
</p>

You define a **subject** (the code under test), declare **variants**
(provider × model × reasoning), run them across **cases** for **N trials
each**, and score every trial with **weighted assertions**. Results persist to
SQLite so you can diff runs and catch statistical regressions when you swap a
model or edit a prompt.

> This is generation 2. It grew inside a production codebase (a talent-search
> NL filter) and was extracted here to stand on its own. The original library
> (`Undetermini` / `UsecaseImplementation`) is preserved under [`legacy/`](./legacy).

---

## Unit test vs eval

|                          | **Unit test**        | **Eval**                                            |
| ------------------------ | -------------------- | --------------------------------------------------- |
| Input → output           | deterministic        | **non-deterministic** (LLM, sampling, ranking…)     |
| Pass criterion           | binary (`=== expected`) | **distribution** (pass-rate over N trials, threshold) |
| Catches                  | logic bugs           | **statistical regressions** (model swap, prompt drift) |

A unit test asks *"does this function compute X correctly?"*. An eval asks
*"does this LLM-driven feature behave correctly **most of the time**?"*.

---

## Requirements

- **Node ≥ 22** (native `better-sqlite3`).
- An `.env` with the provider keys you intend to run, e.g. `OPENAI_API_KEY`
  (and `ANTHROPIC_API_KEY` for Anthropic variants). Only needed for real runs —
  the test suite and typecheck need nothing.

```bash
npm install
```

## Commands

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run eval`         | Run the CLI harness (default subject: `example`).                   |
| `npm run eval:tui`     | Interactive Ink TUI — pick axes, watch trials, sort/aggregate live. |
| `npm run rescore`      | Retroactively re-score stored trials against the current cases.     |
| `npm test`             | `vitest` unit suite (129 tests, no network).                        |
| `npm run typecheck`    | `tsc --noEmit`.                                                     |
| `npm run build:docs`   | Generate API docs into `./docs` via typedoc.                        |

Pick a subject and narrow cases:

```bash
npm run eval -- --subject=example --case-slugs=clearly-positive --trials=5
```

## Layout

```
src/
├── index.ts                  ← public API barrel (typedoc entry point)
├── engine/                   ← the generic harness — never imports a subject
│   ├── api.ts                  EvalEngine (event-emitting run driver)
│   ├── runner-loop.ts          cases × variants × trials (p-limit)
│   ├── variant.ts              EvalVariant (provider × model × reasoning)
│   ├── scorers.ts              weighted caseAssertionsScorer
│   ├── axes/                   cartesian variant expansion + capability matrix
│   ├── cache/                  trial-aware LLM cache (SQLite-backed)
│   ├── storage/                schema, writers, fingerprint
│   ├── rescore/                retroactive rescore
│   ├── pricing.ts              $/1M-token table
│   └── telemetry-middleware.ts token + latency capture
├── clients/
│   ├── cli/                   `npm run eval` entry, console printer
│   └── tui/                   Ink TUI (pages, store, prefs)
├── subjects/
│   ├── registry.ts            composition root — the ONE place subjects live
│   └── example-sentiment/     reference subject (inline cases, no I/O)
└── shared/                    cross-cutting types
```

Design notes live at the repo root: [`VARIANT-AXES-DESIGN.md`](./VARIANT-AXES-DESIGN.md),
[`INTERACTIVE-VARIANT-DESIGN.md`](./INTERACTIVE-VARIANT-DESIGN.md),
[`LLM-CALL-OPTIMIZATION-DESIGN.md`](./LLM-CALL-OPTIMIZATION-DESIGN.md),
[`SCORER-ASYMMETRY-DESIGN.md`](./SCORER-ASYMMETRY-DESIGN.md),
[`PRICING.md`](./PRICING.md), [`ONBOARDING.md`](./ONBOARDING.md).

---

## Adding a subject

A subject is anything implementing the `Subject` contract (`src/engine/runner-loop.ts`):
`name`, `cases`, `variants`, `runOne`, `parse`. See
[`src/subjects/example-sentiment`](./src/subjects/example-sentiment) for a
complete, dependency-free reference.

Then register it — one line, no runner edits:

```ts
// src/subjects/registry.ts
export const SUBJECTS: Record<string, RegisteredSubject> = {
  example: { subject: exampleSentimentSubject, evalFile, casesDir },
  // myThing: { subject: myThingSubject, evalFile, casesDir },
};
```

Every runner resolves subjects through `resolveSubject(name)`, so a new use
case never touches the CLI, the TUI, or the engine.

---

## Concepts

- **Subject** — the code under test + its cases + its variants.
- **Variant** (`EvalVariant`) — one LLM configuration: provider (`openai` /
  `anthropic`), `modelId`, and the provider-specific reasoning knob
  (`reasoningEffort` / `thinkingBudgetTokens`), plus an optional `systemPrompt`
  override hashed into the variant's identity.
- **Case** — one input plus its weighted `assertions` (the *contract*: what the
  output must express, by category).
- **Trial** — one (variant × case) execution. N trials per pair measure
  stability, not one-shot luck.
- **Score** — weighted pass-rate ∈ [0,1] per trial, aggregated per variant.

---

## License

MIT — see [`LICENSE.txt`](./LICENSE.txt).
