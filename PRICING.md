# Eval — pricing reference

Authoritative table for the per-model `$/1M tokens` constants used by the eval cost calculator (`scripts/eval-export-run.ts`).

> Pricing is volatile. **Re-verify monthly.** When you re-verify, update the values + bump `PRICING_VERIFIED_AT` in `scripts/eval-export-run.ts`, and add a row to the changelog at the bottom of this file.

## Current table — verified **2026-05-07**

USD per 1 million tokens. No volume discount, no batch discount, no caching multiplier. Standard global routing (no `inference_geo` premium).

| Model                | Input  | Output | Source                                              |
|----------------------|-------:|-------:|-----------------------------------------------------|
| `gpt-4o-mini`        | $0.15  | $0.60  | aipricing.guru                                      |
| `gpt-4.1-nano`       | $0.10  | $0.40  | aipricing.guru                                      |
| `gpt-4.1-mini`       | $0.40  | $1.60  | aipricing.guru                                      |
| `gpt-4.1`            | $2.00  | $8.00  | aipricing.guru + pricepertoken.com (cross-checked)  |
| `claude-opus-4-6`    | $5.00  | $25.00 | platform.claude.com (official Anthropic docs)       |
| `claude-opus-4-7`    | $5.00  | $25.00 | platform.claude.com (official Anthropic docs)       |

### Sources

- **OpenAI** — `https://www.aipricing.guru/openai-pricing/` (last updated 2026-05-07).
  - Cross-checked `gpt-4.1` against `https://pricepertoken.com/pricing-page/model/openai-gpt-4.1` (last updated 2026-05-01).
  - OpenAI's own page (`https://developers.openai.com/api/docs/pricing`) no longer lists the `gpt-4.x` family — it surfaces only `gpt-5.4`/`gpt-5.5`. The 4.x models remain billable in the API at the values above (legacy but active per `https://developers.openai.com/api/docs/deprecations`).
- **Anthropic** — `https://platform.claude.com/docs/en/about-claude/pricing` (official, no last-updated date shown).
  - **Important**: from Opus 4.5 onward, base pricing is $5/$25 (not the $15/$75 of Opus 4 / 4.1). Earlier code in this repo had the wrong tier — fixed 2026-05-07.
  - Opus 4.7 uses a new tokenizer that may consume up to ~35% more tokens than Opus 4.6 for identical text. Per-token rate is the same; per-prompt cost is higher.
  - 1M-token context is included at standard pricing for Opus 4.5+. No long-context surcharge.

## What's NOT in the table (intentionally)

- **Cache writes / cache reads** — we set `caching: false` on the eval runner, no cache effects to model. If we ever turn caching on, add cache-read pricing (Opus 4.6/4.7: $0.50/MTok = 0.1× base input).
- **Batch API** — 50% discount, only relevant if we move evals to batch.
- **Fast mode (Opus 4.6 only)** — 6× standard rate. Not used in evals.
- **Data residency premium** — 1.1× when `inference_geo` is set. We use global default.
- **Tool use overhead** — adds ~346 system prompt tokens per request when tools are passed. The eval runner uses structured output (`jsonTool` mode for Anthropic), so this overhead is included in the captured `tokens.input` count and doesn't need a separate adjustment.

## How costs are computed

Formula in `scripts/eval-export-run.ts:computeCost`:

```
costUsd = (tokens.input × table[model].input + tokens.output × table[model].output) / 1_000_000
```

The exporter writes the full pricing snapshot at the top of each run JSON:

```jsonc
{
  "schemaVersion": 3,
  "pricing": {
    "verifiedAt": "2026-05-07",
    "sources": { "openai": "...", "anthropic": "..." },
    "table": { "gpt-4.1": { "input": 2.0, "output": 8.0 }, ... }
  },
  "variants": [...]
}
```

→ Even if we later update prices, we can recompute "what would this run cost at today's prices?" by multiplying the trial's frozen `tokens` against the current table. The historical `estimatedCostUsd` per trial stays frozen at run-time.

## Changelog

| Date       | Change                                                                                  |
|------------|-----------------------------------------------------------------------------------------|
| 2026-05-07 | Initial verified table. Fixed Anthropic Opus 4.6/4.7 from $15/$75 → $5/$25 (was wrong). |

## Re-verification procedure

1. Fetch sources listed above. If a source 404s or has obviously stale data, find a replacement (the canonical Anthropic doc is robust; OpenAI's official page rotates more often, hence the aggregator dependency).
2. Compare each model's `(input, output)` to the table here.
3. Update `MODEL_PRICING_USD_PER_1M` and `PRICING_VERIFIED_AT` in `scripts/eval-export-run.ts`.
4. Update the table + add a changelog row in this file.
5. (Optional) Re-export an existing run to confirm the new prices flow through to the JSON payload.

## Pre-2026-05-07 archived runs

The 3 JSON files in `eval-results/runs/` from 2026-05-06 were exported with the old (wrong) Opus pricing $15/$75. Their `estimatedCostUsd` values **overstate Opus cost by 3×**. They lack the `pricing` snapshot block. To delete or recompute, see open task in project memory.
