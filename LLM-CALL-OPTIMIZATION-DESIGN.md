# LLM call optimization — concurrency, rate-limit & provider cache

> Status: **design / TODO** — not implemented. Captured so it can be picked up later
> (likely when the runner gets refactored). Cross-ref: `README.md` → TODO/IDEAS →
> Performance + Caching, and `eval/cache/DESIGN.md` §3 (rate-limit was already flagged as future scope).
>
> Author: Nicolas + Opus 4.8, 2026-06-05. All "current state" claims below were read from source
> (file:line given) and the OpenAI docs were fetched, not recalled.

## TL;DR

Our **own** cache (`eval/cache/`, content-addressed SQLite trial cache) is already good and is
**not** the subject here. The gaps are:

1. **No per-model rate-limit / retry** in the runner — a 429 permanently burns a trial.
2. **The eval shares the prod OpenAI key** (`KALENT_OPENAI_KEY`) → eval runs steal prod's gpt-4.1
   RPM/TPM **and** degrade prod's *provider-side* prompt cache.
3. **Provider prompt cache** (OpenAI automatic caching) is left to chance — under burst load it
   misses, and we don't use the `prompt_cache_key` lever.

Anthropic prompt caching (`cache_control`) is **deferred** — kalent prod is OpenAI-only today.

## Current state (verified)

| Aspect | State | Ref |
|---|---|---|
| Concurrency | single global `pLimit(opts.maxConcurrency)`, all models mixed, default 5 | `eval/src/engine/runner-loop.ts:204`, `README.md:265` |
| Retry / backoff | **none** — on error: insert `status='fail'` row + `throw err` | `eval/src/engine/cache/trial-cache-middleware.ts` (catch block) |
| Our trial cache | content-addressed, trial-index-aware, cross-run, additive | `eval/src/engine/cache/key-builder.ts`, `eval/cache/DESIGN.md` |
| OpenAI provider cache | tracked only (`usage.inputTokens.cacheRead`), never *steered* | `eval/src/engine/cache/trial-cache-middleware.ts` |
| Provider key | **same key as prod** (`KALENT_OPENAI_KEY`) | confirmed by Nicolas 2026-06-05 |

### Cache-key trap (read before touching provider options)

`paramsSha` hashes `params.providerOptions` (`eval/src/engine/cache/key-builder.ts`). So injecting
`cache_control` / `prompt_cache_key` **into `providerOptions` naively invalidates the entire
cross-run SQLite cache** (e.g. the ~690 gpt-4.1 trials). Any provider-cache work must either:
- pass these via a channel that is **not** in `providerOptions`, or
- **exclude** the cache-steering markers from `paramsSha` (they are billing/routing hints, same
  semantic input → same output, so they should not be part of the content hash).

## How OpenAI actually behaves (fetched 2026-06-05, developers.openai.com)

**Rate limits** are enforced at the **organization + project** level — *not* per API key, *not*
per user. All keys in a project share the pool; some model families share a bucket. Units: RPM,
TPM, RPD, TPD. → A per-model `TokenBucket` in our code is the right *granularity*, but the *value*
is the project tier, **shared with prod** if we use the prod key.

**Read your real limit** from the response headers of any call (per-model, so probe gpt-4.1):

```bash
curl -sS https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $KALENT_OPENAI_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4.1","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' \
  -D - -o /dev/null | grep -i x-ratelimit
# x-ratelimit-limit-requests / -remaining-requests / -reset-requests   → RPM
# x-ratelimit-limit-tokens   / -remaining-tokens   / -reset-tokens     → TPM
```

**Automatic prompt caching:**
- Activates at **≥1024 tokens** (our system prompt qualifies easily).
- Routes on a **hash of the first ~256 tokens** of the prompt → a specific machine.
- TTL: **5–10 min** of inactivity, max 1h (24h extended retention).
- **Burst kills it:** *"When requests exceed approximately **15 requests per minute** for the same
  prefix and key, some may overflow and get routed to additional machines, reducing cache
  effectiveness."* → cranking concurrency on one prefix is counter-productive: overflow machines
  start cold → full-price input + more TPM consumed.
- Lever: **`prompt_cache_key`** — *"influence routing and improve cache hit rates"*. Stable key per
  prefix keeps same-prefix calls sticky on one machine **above** 15 rpm (best-effort, not infinite).

## Recommendation (ordered)

### (a) Isolate the eval from prod — do this first

Create a **dedicated OpenAI project** ("eval") in the same org, with its own API key, and cap its
rate-limit in the dashboard. Rationale:
- Limits are per-project → eval can no longer starve prod's gpt-4.1 RPM/TPM (even a runaway run).
- Provider cache is keyed per *prefix + key* → eval warms its own cache, stops evicting prod's.
- Same org → same invoice, near-zero admin.
- Then eval can be pushed to its own cache sweet-spot without watching prod.

Switch the eval to read `KALENT_OPENAI_EVAL_KEY` (or similar), falling back to `KALENT_OPENAI_KEY`.

### (b) Per-model rate-limit + retry middleware (runner)

Add a `rateLimitMiddleware` to the AI-SDK chain, placed **below** `trialCacheMiddleware` in the
`extraMiddlewares` array (`eval/src/engine/runner-loop.ts:237`) so **cache hits don't consume a
rate-limit token**. Reuse the Hermes primitives — `~/.claude/skills/LLMCall/lib/limiters.ts`:
lazy-refill `TokenBucket` (RPM) + FIFO `Semaphore` (concurrency), **per model**, plus retry with
backoff on 429/5xx. Calibrate RPM/TPM from the measured `x-ratelimit-*` headers (the registry
philosophy: *measure, then raise*). This subsumes the existing `### Performance` TODO (README L265):
per-provider/model buckets, adaptive 429 backoff, and a separate ceiling for cache-hit jobs.

### (c) Steer the OpenAI provider cache

- Set a stable **`prompt_cache_key` per variant** (its frozen system-prompt identity) → keeps
  same-prefix calls sticky above 15 rpm.
- **Warm-up:** for each unique prefix, fire **1** call and await it (cache populated), *then* release
  the parallel flood — otherwise the first concurrent wave all races cold = 100% miss.
- Tune concurrency to a **sweet-spot**, not max: too high on one prefix = overflow machines = misses.
- ⚠️ Route `prompt_cache_key` so it does **not** land in `paramsSha` (see Cache-key trap above).

### Deferred

- **Anthropic `cache_control`** (ephemeral, 5-min TTL, group jobs by variant to keep it warm) —
  revisit if/when an Anthropic model re-enters the eval mix.
- **TPM-aware bucket** — current `TokenBucket` is RPM-only; weight by token count if we hit TPM
  before RPM (likely on big system prompts).
