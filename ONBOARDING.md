# Eval harness — onboarding

> Read this once and you can author eval cases and stand up a brand-new subject
> on your own. It assumes **zero prior knowledge** of the harness — if you last
> looked at the code months ago, start here.
>
> Companion docs: `eval/README.md` (dense reference, some sections predate the
> `src/` refactor), `.cursor/rules/eval.mdc` (so Cursor assists you while writing
> cases). This file is the human-readable walkthrough.

---

## 1. What the eval is, in one paragraph

We ask an LLM to do a task (today: turn a recruiter's sentence into search
filters). The eval is a **harness that measures how well it does that task**,
repeatably and cheaply. You write **cases** (an input + what a good answer must
satisfy). The harness runs each case many times through one or more model
**variants**, a deterministic **scorer** turns each answer into a number in
`[0,1]`, and everything is stored in SQLite so reruns are nearly free (a cache
serves identical calls). It is **not** tied to talent-search — that is just the
first *subject*. You can point it at any LLM task.

## 2. Vocabulary (the 7 words that matter)

| Word | Meaning | Lives in |
|------|---------|----------|
| **Subject** | The thing under test. A bundle of: a system prompt, its cases, its model variants, and a `runOne` that calls the LLM. The seam that makes the harness reusable. | `eval/src/engine/runner-loop.ts` (the `Subject<V, TInput, TOutput>` interface) |
| **Case** | One test scenario: an `input` plus the `assertions` its output must satisfy. | `core/.../nl-filter-cases/*.case.ts` (talent), `eval/src/subjects/example-sentiment/cases.ts` (example) |
| **Assertion** | A single semantic predicate over the output: `check: (output) => boolean`, with a `weight` and a display `category`. | inside each case |
| **Variant** | One model configuration to run the cases against (model id + optional system-prompt / reasoning override). | the subject's `variants` array |
| **Trial** | One execution of (variant × case). Run N times (`--trial-count`) to measure consistency. | — |
| **Scorer** | Turns a trial's output + the case's assertions into a score. One scorer today: `caseAssertionsScorer`. | `eval/src/engine/scorers.ts` |
| **Run** | One invocation of the harness: variants × cases × trials, aggregated + persisted. | `eval-results/eval.db` |

The engine (`eval/src/engine/*`) is **generic** over `<V, TInput, TOutput>`. The
talent-specific code lives in `core/search-engine/services/` and the example
subject in `eval/src/subjects/example-sentiment/`. The list of subjects the CLI
can run is the **registry** (`eval/src/subjects/registry.ts`).

## 3. The flow of one trial

```
case.input ─▶ subject.runOne({input, variant}) ─▶ output (TOutput)
                       │  (real LLM call, wrapped with telemetry + cache)
                       ▼
        caseAssertionsScorer({ output, assertions }) ─▶ score ∈ [0,1] + per-category
                       ▼
        trial row + assertion rows + score row ─▶ eval-results/eval.db
```

Aggregated per case (mean score, variance) and per variant (avg score, **Pass%**
= fraction of *perfect* trials, $ cost, latency).

## 4. Run it

```bash
# Node 22 required (.nvmrc = 22). The `--` forwards flags to the script.
npm run eval                                    # default subject (talent), all cases, 30 trials
npm run eval -- --subject=example --trial-count=3   # the example sentiment subject
npm run eval -- --case-slugs=dev-2642-python-nantes --trial-count=5
npm run eval -- --subject=example --max-concurrency=3
npm run eval:tui                                # interactive picker (cases / variants / axes)
```

`--subject` picks which registered subject to run (default `talent`). Omit it and
nothing changes from before. Run an unknown subject and it tells you the valid
ones.

Inspect results: `sqlite3 eval-results/eval.db` (tables: `runs`, `trials`,
`assertion_results`, `trial_scores`, `system_prompts`, `variant_configs`).

## 5. The scorer: how a score is computed

One scorer, `caseAssertionsScorer` (`eval/src/engine/scorers.ts`). It is a
**weighted fraction of importance**:

```
score = Σ(weightᵢ · passedᵢ) / Σ(weightᵢ)
```

- Each assertion has a `weight` (default `1`, clamped `≥ 0`).
- `weight: 0` = **informational**: tracked and displayed, but excluded from the
  denominator (use it for a signal you want to watch without it moving the score).
- All-default weights ⇒ score is just `passed / total`.
- Empty assertions, or all-zero weights ⇒ score `1`.
- **Pass%** counts a trial as "perfect" iff every weight-bearing assertion passed.
- **`category` never affects the score** — it's display/grouping only (the
  per-category breakdown uses the same weighted formula on each subset).

## 6. Author your first case (talent subject)

1. Copy the template:
   `cp core/search-engine/services/nl-filter-cases/_template.case.ts \
       core/search-engine/services/nl-filter-cases/<your-slug>.case.ts`
2. Generate UUIDs: `node -e "console.log(crypto.randomUUID())"` — one for the
   case `id`, one per assertion `id`. **UUIDs are immutable audit keys** — never
   reuse or change them.
3. Fill `slug` (= filename without `.case.ts`), `source` (e.g. a ticket id or
   `MANUAL`), `difficulty`, and `input` (the recruiter prompt).
4. Write `assertions[]`. Keep them **semantic, not syntactic** — assert *intent*
   ("a developer role is present", "YOE is open-ended `5-100`"), using the shared
   predicates in `nl-filter-cases/helpers.ts` (`isRequired`,
   `requiresJobTitleToken`, …). Don't assert an exact filter array — the LLM may
   legitimately vary shape.
5. The case is **auto-discovered** — `nl-filter-cases/index.ts` imports every
   `*.case.ts` and enforces unique ids/slugs. No registration needed.
6. Validate cheap: `npm run eval -- --case-slugs=<your-slug> --trial-count=3`.
   If it holds across 2+ models at 3 trials, raise the trial count.

**Bump `version` on an assertion only when its `check` semantics change**
(1 → 2 → 3). Renaming, retagging the category, or changing a weight does **not**
bump. Helpers are not auto-versioned: if you change a helper's meaning, manually
bump `version` on every assertion that uses it (`git grep` the helper name), then
rescore.

### Anatomy of an assertion (from `dev-2642-python-nantes.case.ts`, `description` elided)

```ts
{
  id: '84682188-315d-4060-83f4-02fe7ee3b0f4', // immutable UUID v4
  version: 2,                                  // bump only on check-semantics change
  category: 'ROLE',                            // display/grouping only
  weight: 5,                                    // relative importance in the score
  name: 'JOB_TITLE mentions developer',
  check: (o) =>
    requiresJobTitleToken(o, [
      'developer', 'developers', 'développeur', 'développeurs', 'dev', 'devs',
    ]),
}
```

## 7. Add a NEW subject (your own use case — not search)

This is the part that used to be impossible. The engine is generic; the only
thing that knows which subjects exist is the **registry**. Recipe:

1. **Create a subject folder.** New/example subjects live under
   `eval/src/subjects/<your-subject>/`. A subject may also live next to its
   production service — the talent subject does
   (`core/search-engine/services/natural-language-filter.service.eval.ts`). Either
   home is fine; the registry bridges both.
2. **Implement the `Subject<V, TInput, TOutput>` contract**
   (`eval/src/engine/runner-loop.ts`). The canonical, minimal reference is the
   example subject: `eval/src/subjects/example-sentiment/sentiment.subject.ts`.
   You need:
   - `name`, `systemPrompt`
   - `cases` — an array of `defineCase<TInput, TOutput>({...})`
   - `variants` — `[{ name, provider: 'openai', modelId }]`
   - `runOne({ input, variant, extraMiddlewares })` — wrap the model with
     `telemetryMiddleware(sink)` **first**, then `...extraMiddlewares` (the
     cache), call the LLM (`generateText` from `ai`), return
     `{ output, telemetry: sink.value }`. **The telemetry sink is mandatory** —
     if it's still `null` after the call, throw (the chain is misconfigured).
   - `parse(raw)` — reconstruct `TOutput` from a stored generate result (used by
     the retroactive rescore). For text output this is just "read the text part".
   - `buildProviderOptions(variant)` — return `undefined` if you have no
     provider-option axes (the example does exactly this).
   - Export `EVAL_FILE` / `EVAL_CASES_DIR` source paths (stamped on run rows).
3. **Register it** — add ONE line to `SUBJECTS` in
   `eval/src/subjects/registry.ts`:
   ```ts
   export const SUBJECTS = {
     talent:  { subject: evalSubject,            evalFile: EVAL_FILE,                  casesDir: EVAL_CASES_DIR },
     example: { subject: exampleSentimentSubject, evalFile: EXAMPLE_SENTIMENT_EVAL_FILE, casesDir: EXAMPLE_SENTIMENT_CASES_DIR },
     // mine: { subject: mySubject, evalFile: MY_EVAL_FILE, casesDir: MY_CASES_DIR },
   };
   ```
4. **Run it**: `npm run eval -- --subject=mine --trial-count=3`. No runner edits.

That's the whole loop. The example sentiment subject runs end-to-end today
(`npm run eval -- --subject=example`) — copy it.

### The worked example: sentiment classifier

`eval/src/subjects/example-sentiment/` is a deliberately tiny, NON-talent
subject (input: a sentence → output: `'positive' | 'negative' | 'neutral'`). It
exists to prove the harness is subject-agnostic and to be the thing you copy. Its
`category` on assertions is `'SENTIMENT'` — not a talent category — which works
because `AssertionCategory` is now an **open union** (any string is allowed; the
talent values just keep autocompletion).

## 8. Gotchas (the things that bite)

- **Node 22**, always (`.nvmrc`). `tsx` runs the scripts (not bun, despite older
  README hints). `better-sqlite3` is built for Node 22 — running under another
  major fails the native binding.
- **API keys** (in `.env`, loaded via `dotenv/config`): `OPEN_AI_API_KEY`, and
  `ANTHROPIC_API_KEY` *or* `PERSO_ANTHROPIC_KEY`. With no Anthropic key, Claude
  variants silently drop and only OpenAI runs.
- **Telemetry sink is mandatory** in `runOne` — populate it or throw.
- **Cache is byte-sensitive**: the key combines model id + system-prompt hash +
  schema hash + sampling params. Any incidental change to the provider-options
  blob busts the cross-run cache. Keep `buildProviderOptions` output stable.
- **Results DB**: `eval-results/eval.db` (SQLite, WAL). Each run freezes git
  sha+dirty, dataset hash, prompt hash, and a pricing snapshot — so any old trial
  can be re-priced/audited.
- **Cache modes**: `auto` (lookup + append-on-miss, default) and `write-only`
  (always append fresh, keep history). The trials table is append-only.

## 9. Known sharp edges (honest state)

- **The CLI is the fully subject-agnostic path.** The **TUI** (`npm run eval:tui`)
  runs any `--subject` at runtime, but its interactive *variant/axes* UI is still
  typed to the talent `EvalVariant` (it offers OpenAI reasoning-effort vs
  Anthropic thinking-budget — a discriminated-union concern). For a new subject,
  drive it from the CLI. The deeper fix (named, deferred) is a **declarative
  per-subject axes descriptor on the `Subject` interface** — each subject declares
  its tunable axes as data; that single change would erase both the TUI boundary
  cast and `Router`'s `EvalVariant` typing, making the TUI as generic as the CLI.
- **One scorer today** (`caseAssertionsScorer`). Alternative scorers
  (LLM-as-judge, recall/precision) are designed but unbuilt — the storage schema
  already supports plural scorers (`scorer_name` + `scorer_version`).
- **No CI gate / per-PR threshold** yet — the eval is a dev tool, costs money, run
  on demand.
