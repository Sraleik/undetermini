# Scorer asymmetry — "What I want" vs "What I don't want"

> Design reflection, not a spec. Captured while reworking
> `dev-fullstack-react-node-lyon.case.ts` — gpt-4.1 scored 87.9% on that
> case, masking the fact that a whitelist failure (model hallucinating a
> filter) can return **zero candidates** in production, while a canonical
> `"Lyon, France"` miss "only" softens the ranking.
>
> Discussed with Nicolas 2026-05-19 + 2026-05-20 (second pass).
> Not implemented yet — kept here for the next scoring rework.

---

## The problem

The current scoring scheme is **additive weighted average**:

```
case_score = Σ (assertion.passed × assertion.weight) / Σ assertion.weight
```

Even with a strict weight gradient (`ROLE > LOCATION > YOE > HISTORY = OTHER`),
this scheme **conflates two fundamentally different kinds of correctness**:

| Axis | Failure cost | Shape |
|---|---|---|
| **What I want** — presence of correct extraction | Graded (a missing token softens recall, doesn't break the search) | Symmetric — N points wanted, N or fewer earned |
| **What I don't want** — absence of damage | Catastrophic (one hallucinated filter, one sub-filter at root, can drop result count to 0) | Asymmetric — pass/fail with cliff-edge cost |

Bumping `weight: 10` on the whitelist scorer doesn't fix this — the result
is still averaged in. An 87% score still means *either* "everything fine, one
small miss" *or* "model invented a filter that kills the search in prod".
The single-number aggregate loses the information that matters most.

## The asymmetry in concrete terms

Lyon case, gpt-4.1, observed in the TUI 2026-05-20:

```
Score 87.9%   ROLE 100%   LOCATION 60%   OTHER 100%   YOE 100%   HISTORY 100%
```

- LOCATION 60% = `Lyon, France` canonical fails. → Production effect:
  results still come back, just with worse ranking / edge issues. **Graded
  miss.**
- OTHER 100% = whitelist holds, no `isExcluded` ghost, no sub-filter at
  root. → Production effect if any of these fails: search may return zero
  candidates. **Cliff-edge.**

Today both contribute to the same average, weighted the same band (low). A
case where LOCATION is perfect but whitelist fails would score better
than this run — even though the prod outcome is catastrophically worse.

## Three patterns we could move toward

From least to most radical:

### 1. Two-column score (Nicolas's preferred framing)

Aggregate "want" and "don't-want" assertions into **two separate scores**,
displayed side by side. Never collapse to a single number.

```
gpt-4.1   Want 95%   Safety 80%   ← one hallucination, surfaced
gpt-4o    Want 92%   Safety 100%  ← weaker recall but never breaks prod
```

**Pros:** preserves the precision/recall-style irreducibility; TUI tells a
business story at a glance; doesn't require choosing between veto and
penalty.
**Cons:** sort order no longer obvious — need a tie-break rule
(`safety desc, want desc`? `want × safety`?).

### 2. Multiplicative penalty

Single number, but don't-want misses multiply rather than subtract:

```
score = score_want × ∏ (1 - penalty_i)  for each don't-want failed
```

E.g. each don't-want failure multiplies the want-score by 0.5. Two failures
→ ×0.25. **One don't-want miss visibly tanks the case.**

**Pros:** keeps single-number ergonomics, makes failures cliff-shaped.
**Cons:** the curve is fiddly to tune; non-linear so harder to reason about.

### 3. Veto / kill scorer

Mark certain assertions as `severity: 'blocking'`. If they fail, the case
score is **forced to 0** (or a red flag, "INVALID").

```
{ id: '...', category: 'OTHER', severity: 'blocking',
  name: 'no filter outside whitelist',
  check: (o) => o.every(...) }
```

**Pros:** brutally honest — a broken case is broken.
**Cons:** loses the gradation; harder to see "almost passed except for X".

## Tooling gap in the current schema

The only existing asymmetry knob is `weight: 0`, which means
**informational** — the scorer runs but is excluded from the denominator.
That's the *opposite* of what we want: it removes the scorer's voice instead
of amplifying it.

A future schema needs at least one of:

- `severity: 'blocking' | 'graded'` (enables pattern 3)
- `column: 'want' | 'avoid'` (enables pattern 1)
- `penaltyFactor: number` for failures (enables pattern 2)

## Which assertions are "want" vs "avoid" today?

Looking at the Lyon case as a worked example — this is the partition Nicolas
would likely apply across all cases:

### Want (recall / fidelity)

- ROLE — `developer` in title, `react`/`node`/`fullstack` present
- HISTORY — required JOB_TITLE has CURRENT
- LOCATION — Lyon required, no radius, canonical `"Lyon, France"`
- YOE — required and equals `"3-5"`

### Avoid (precision / safety)

- LOCATION — `exactly one LOCATION filter` (extra LOCATION = drift)
- YOE — `exactly one YEARS_OF_EXPERIENCE filter`
- OTHER — whitelist lock
- OTHER — no filter is excluded
- OTHER — `noExclusiveSubfilterAtRoot`

Note: today these all live under categories `LOCATION`, `YOE`, `OTHER`
indiscriminately. A column/severity field would make the split orthogonal
to category. A concrete asymmetry artifact to revisit during this rework:
`noExclusiveSubfilterAtRoot` scores a fail when the engine actually ignores
the emission in prod — see `.cursor/rules/search-engine-rules.mdc` →
"Subfilter at root = structural extraction error (engine-ignored in prod)".

## Open questions for the rework

1. **Single column or two?** — the 2-column display is tempting, but does it
   complicate variant comparison across many cases (the TUI variant table)?
   Maybe column = the per-case view, single rolled-up = the cross-case view.
2. **How blocking is "blocking"?** — does a veto fail send the case to a
   visible "INVALID" bucket, or just clamp the score to 0? Difference
   matters for averaging across cases in the variant table.
3. **Backward compatibility** — every existing assertion in
   `assertion_results` was scored without these semantics. Do we re-score
   retroactively (already a thing in `eval/rescore/`), or only apply going
   forward?
4. **Per-case override** — some cases might legitimately want a LANGUAGE
   filter that another case forbids. Severity / column must be per-case,
   not per-assertion-globally.

## Status

- 2026-05-19 first surfaced (Nicolas, voice)
- 2026-05-20 re-surfaced via the Lyon scorer rework (this doc)
- Not blocking current per-case scoring work — the strict weight gradient
  (`ROLE > LOCATION > YOE > HISTORY = OTHER`) is the best the additive
  scheme can do, and it's already a meaningful step.
- Pick back up after the remaining three cases (account-exec, cfo-paris,
  python-nantes) are reworked under the current scheme — that's when we'll
  have enough cross-case evidence to know if the additive scheme is "good
  enough" or whether the asymmetry pain forces the rework.
