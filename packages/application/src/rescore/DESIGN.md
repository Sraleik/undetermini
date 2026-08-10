# `eval/rescore/` — DESIGN (v3)

> Status : **draft v3, validé pour implémentation**
> Author : conversation Nicolas × Claude, 2026-05-07
> Découpage en deux commits : Phase 1 (refactor storage DB-only) puis Phase 2 (feature rescore).
>
> ### Changelog
> - **v3.4 (2026-05-07 nuit, simplification pass 3)** : `llm_calls` renommé en `trials` (vocab aligné avec `reference_eval_vocabulary.md`). `trial_observations` supprimé — le contexte (case_id, variant_name, created_in_run_id) vit directement sur `trials`, et le cache_hit ne se persiste plus (dispo runtime via `RunResult.trial.cacheHit` mais pas en DB). UNIQUE composite sur `trials` viré (id PRIMARY KEY UUID suffit) ; cache lookup via `ORDER BY created_at DESC LIMIT 1`. Default `EVAL_CACHE_MODE` = `'auto'`. Ajout fields canoniques sur `trials` : `provider`, `finish_reason`, `tokens_*`, `latency_ms`, `status`, `error`. Schéma passe à **4 tables**.
> - **v3.3 (2026-05-07 nuit, review pass 2)** : `CacheMode` renommé `'auto' | 'write-only'` (plus de `null`) — le middleware est toujours installé, `cacheMode` ne contrôle que le lookup. `eval/storage/write.ts` exposera juste `writeRunToDb` (pas de `insertRun(partial) + finalizeRun`). §9.2 fusionné avec §6. Mentions Zod neutralisées dans les edge cases (le framework reste lib-agnostic).
> - **v3.2 (2026-05-07 nuit, simplification pass 2)** : drop du `cacheMode='refresh'` (incompatible avec append-only). `llm_calls` simplifié à 1 colonne output (`output_raw` seul ; pas de `output_parsed` ni `parse_error` stockés — redondants). Generics `EvalCase<TInput, TOutput>` + `Subject.parse(raw): TOutput` exposé pour le rescore retroactive. Pré-création de la row `runs` virée (un seul INSERT post-runEval).
> - **v3.1 (2026-05-07 nuit)** : propagation `llm_call_id` middleware → runner, cache middleware always-on côté write, bump-detection implicite via INSERT OR IGNORE, commit cleanup intermédiaire (3 commits au total).
> - **v3 (2026-05-07 soir)** : architecture DB-only complète, cache absorbé dans la table `llm_calls`, identité trial = `llm_call_id` UUID (pas le `runId`), découpage Phase 1 / Phase 2.
> - **v2 (2026-05-07 après-midi)** : maille per-assertion (UUID + version), DB dédiée, helpers non versionnés. *Remplacé : v2 gardait JSON snapshots et créait une 2e source de vérité.*
> - **v1 (2026-05-07 matin)** : versioning case-level + cohabitation `evalite.db`. *Remplacé : evalite est runtime-mort.*

---

## 1. Problème

Les assertions par case ne sont pas justes du premier coup. En itérant sur `requiresRole`, `yearsOfExperienceCovers`, `isRequired`, etc., on modifie la liste/sémantique des assertions plusieurs fois. Aujourd'hui :

- Les outputs LLM sont persistés (snapshot JSON par run + cache filesystem).
- Les **scores** appliqués à ces outputs sont **gelés au moment du run** dans le snapshot.
- Si tu modifies une assertion *après* coup, **rien ne se met à jour**. Tu compares des trials notés sous des règles différentes sans le savoir.

On perd l'audit *"cette assertion v2 corrige bien la régression v1"* sauf à relancer toute la chaîne LLM (cher).

## 2. Reframe — pas une commande, un sync auto

**Les scores deviennent un cache dérivé des outputs.** Si une assertion change ou est ajoutée, son résultat est *stale*. Le système le détecte automatiquement et le recalcule au prochain run, sans appel LLM.

Pas de commande à lancer manuellement. Pas de question "quel run rescorer". Le sync est implicite, lazy, déclenché en post-step du runner.

## 3. Architecture cible — DB-only

Une seule source de vérité : `eval-results/eval.db` (SQLite). Tout ce qui est persistant y vit. Plus de JSON authoring, plus de cache filesystem.

### 3.1 Schéma — 4 tables

```sql
-- Métadonnées du run
CREATE TABLE runs (
  id TEXT PRIMARY KEY,                     -- '2026-05-07T15-43__157695a' (startedAt + git.sha[:7])
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  git_sha TEXT NOT NULL,
  git_dirty INTEGER NOT NULL,
  dataset_hash TEXT NOT NULL,
  system_prompt_text TEXT NOT NULL,
  system_prompt_sha256 TEXT NOT NULL,
  eval_file TEXT NOT NULL,
  cases_dir TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  pricing_table_json TEXT NOT NULL,        -- snapshot complet de MODEL_PRICING_USD_PER_1M au moment du run
  pricing_verified_at TEXT NOT NULL
);

-- LE trial canonique (= 1 appel LLM unique). Absorbe le cache filesystem ex eval-results/cache/.
-- Append-only : pas de UNIQUE composite, plusieurs rows possibles pour la même cache key (différentes revisions ordonnées par created_at).
CREATE TABLE trials (
  id TEXT PRIMARY KEY,                     -- UUID v4, généré au moment du fresh call

  -- Cache lookup key (model + prompt + params + variance index)
  model_id TEXT NOT NULL,                  -- 'gpt-4.1', 'claude-opus-4-7', ...
  provider TEXT NOT NULL,                  -- 'openai' | 'anthropic' (dénormalisé pour SQL ergonomique)
  prompt_sha TEXT NOT NULL,                -- hash du prompt envoyé (cf eval/cache/key-builder.ts)
  static_hash TEXT NOT NULL,               -- hash des params provider (temperature, etc.)
  trial_index INTEGER NOT NULL,            -- 0..trialCount-1, sémantique de variance (PAS auto-inc)

  -- Contexte (qui a créé ce trial, dans quel cadre)
  case_id TEXT NOT NULL,                   -- UUID du case
  case_slug_at_creation TEXT NOT NULL,     -- snapshot du slug au moment du fresh call (debug)
  variant_name TEXT NOT NULL,              -- 'gpt-4.1', etc.
  created_in_run_id TEXT NOT NULL REFERENCES runs(id),

  -- Output + telemetry du call original
  output_raw TEXT,                         -- LanguageModelV3GenerateResult sérialisé. NULL si status='fail'.
  output_hash TEXT,                        -- sha256 de output_raw, NULL si fail
  finish_reason TEXT,                      -- 'stop' | 'length' | 'tool-calls' | etc.
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  estimated_cost_usd REAL,                 -- coût du call original (avec la pricing du run de création)
  latency_ms INTEGER NOT NULL,             -- latency LLM (le vrai call, pas un cache hit)
  status TEXT NOT NULL,                    -- 'success' | 'fail'
  error TEXT,                              -- message si status='fail' (LLM error ou parse error)
  created_at TEXT NOT NULL
);
CREATE INDEX idx_trials_cache_lookup ON trials (model_id, prompt_sha, static_hash, trial_index, created_at DESC);
CREATE INDEX idx_trials_case ON trials (case_id);
CREATE INDEX idx_trials_run ON trials (created_in_run_id);

-- 1 row par (trial × assertion × version) évalué. Append-only.
CREATE TABLE assertion_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  assertion_id TEXT NOT NULL,              -- UUID de l'assertion (cf 4.1)
  assertion_version INTEGER NOT NULL,
  passed INTEGER NOT NULL,                 -- 0 ou 1
  category TEXT NOT NULL,                  -- snapshot au moment du calcul
  computed_at TEXT NOT NULL,
  UNIQUE (trial_id, assertion_id, assertion_version)
);
CREATE INDEX idx_ar_trial ON assertion_results (trial_id);
CREATE INDEX idx_ar_assertion ON assertion_results (assertion_id, assertion_version);

-- Score agrégé per-trial pour un (scorer × set d'assertions courant). Append-only.
CREATE TABLE trial_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  scorer_name TEXT NOT NULL,               -- 'CaseAssertions'
  scorer_version INTEGER NOT NULL,
  assertion_set_fingerprint TEXT NOT NULL, -- sha1(sorted [{id, version}, ...])
  score REAL NOT NULL,
  metadata TEXT NOT NULL,                  -- JSON {passed: [{id, version, name, category}], failed: [...], byCategory}
  computed_at TEXT NOT NULL,
  UNIQUE (trial_id, scorer_name, scorer_version, assertion_set_fingerprint)
);
CREATE INDEX idx_ts_trial ON trial_scores (trial_id);
```

**Cache lookup query** (utilisée par le middleware) :

```sql
SELECT * FROM trials
WHERE model_id = ? AND prompt_sha = ? AND static_hash = ? AND trial_index = ?
  AND status = 'success'                   -- les trials échoués ne sont pas cacheables
ORDER BY created_at DESC
LIMIT 1;
```

L'index `idx_trials_cache_lookup` couvre cette query. ~µs.

**Cache write** : append simple, pas de constraint à gérer.

```sql
INSERT INTO trials (id, model_id, ..., created_at) VALUES (?, ?, ..., ?);
```

### 3.2 Identité

| Concept | Identifiant | Stable |
|---|---|---|
| Run | `runs.id` = `${startedAt}__${git.sha[:7]}` | par run |
| **Trial canonique** (= 1 appel LLM) | `trials.id` UUID | jamais regénéré |
| Case | `EvalCase.id` UUID dans le case file | inchangé, déjà existant |
| Assertion | `CaseAssertion.id` UUID + `version` int | nouveau Phase 1 |
| Scorer | `scorer_name` + `scorer_version` int | nouveau Phase 1 |

**Point clé** : `assertion_results` et `trial_scores` sont attachés à `trial_id` (canonique, déterministe), **pas au run**. Si Run B hit le cache sur un trial créé par Run A, le score est calculé une seule fois (au moment de la création par Run A) et réutilisé. `INSERT OR IGNORE` rend les writes idempotents — si Run B re-tente d'écrire les mêmes assertion_results / trial_scores, no-op.

**Sur le cache hit per-run** : pas tracé en DB. Dispo runtime via `RunResult.variants[].cases[].trials[].cacheHit` (cf `runner-loop.ts:218`) si tu veux logger en console pendant un run. Pas d'historique long-terme — décision alignée avec `feedback_eval_results_display.md` ("pas d'info cache").

**Coût per-run** : `SELECT SUM(estimated_cost_usd) FROM trials WHERE created_in_run_id = ?`. Un run qui ne fait que des cache hits → 0 trials créés → coût $0. Sémantique identique au code actuel (`runner-loop.ts:126-128`).

### 3.3 Ce qui disparaît côté filesystem

- ❌ `eval-results/runs/*.json` — plus jamais écrit. Anciens fichiers laissés en archive, à `rm` après merge.
- ❌ `eval-results/cache/<...>` — absorbé dans `trials`. Anciens fichiers à `rm`.
- ❌ `eval-results/evalite.db` — vestige, à `rm`.

→ Il ne reste qu'un fichier persistant : `eval-results/eval.db`.

## 4. Versioning des assertions et du scorer

### 4.1 Forme du `CaseAssertion` + `EvalCase` (génériques)

Les types sont **paramétrés** sur `TInput` et `TOutput` pour qu'on puisse tester n'importe quel subject (pas juste NL filter), avec n'importe quelle forme d'input (string aujourd'hui, object/multimodal/multi-turn demain) et n'importe quelle forme d'output parsé.

```ts
// eval/types.ts
export type CaseAssertion<TOutput = unknown> = {
  /** UUID v4 stable, généré une fois à la création de l'assertion. Ne bouge jamais. */
  id: string;
  /** Bumpé manuellement quand la sémantique du `check` change. Démarre à 1. */
  version: number;
  /** Libellé humain. Éditable librement (renommer ne casse rien — l'audit s'appuie sur `id`). */
  name: string;
  category: AssertionCategory;
  check: (output: TOutput) => boolean;
};

export type EvalCase<TInput = unknown, TOutput = unknown> = {
  id: string;
  slug: string;
  source: string;
  difficulty: CaseDifficulty;
  input: TInput;                                   // generic, aujourd'hui string pour NL filter
  assertions: CaseAssertion<TOutput>[];
};

export const defineCase = <TInput, TOutput>(
  c: EvalCase<TInput, TOutput>,
): EvalCase<TInput, TOutput> => c;
```

Le subject (`eval/runner-loop.ts:Subject`) est parametré par les mêmes generics + expose un `parse(raw): TOutput` standalone utilisé par le rescore retroactive :

```ts
// eval/runner-loop.ts
export type Subject<
  V extends SubjectVariant,
  TInput = unknown,
  TOutput = unknown,
> = {
  name: string;
  systemPrompt: string;
  cases: EvalCase<TInput, TOutput>[];
  variants: V[];
  runOne: (args: {
    input: TInput;
    variant: V;
    extraMiddlewares?: LanguageModelV3Middleware[];
  }) => Promise<{ output: TOutput; telemetry: CallTelemetry }>;
  parse: (raw: unknown) => TOutput;        // ← NEW : reconstitue TOutput depuis output_raw stocké en DB
};
```

Le subject NL filter actuel se type comme `Subject<MyVariant, string, NormalizedFilterType[]>`. L'implémentation de `parse` est libre côté subject (le framework eval ne dépend d'aucune lib de validation) — pour NL filter, c'est `parse: (raw) => filterSchema.parse(raw)` parce que le `filterSchema` Zod existe déjà côté prod (`core/search-engine/services/natural-language-filter.service.ts`) et que le réutiliser est gratuit. Un autre subject (ex un classifier boolean) pourrait implémenter `parse: (raw) => Boolean((raw as any).text)` sans aucune lib externe.

**Rappel** : `eval/` n'importe ni n'importera Zod. Le contrat `Subject.parse` est purement structurel — chaque subject choisit sa stack de validation (Zod, type-guard manuel, ArkType, rien du tout, …).

### 4.2 Règle de bump par assertion

| Action | Effet |
|---|---|
| Modifier la fonction `check` (sémantique) | Bump `version: N → N+1` |
| Renommer `name` (libellé) | **Pas** de bump. `id` est ce qui audite. |
| Changer `category` | Pas de bump strict requis. |
| Ajouter une nouvelle assertion | Nouvel UUID, `version: 1`. |
| Retirer une assertion | L'`id` disparaît du tableau. Rows historiques restent en DB. |

### 4.3 Helpers — règle manuelle, non versionnés

Les helpers (`eval/helpers.ts` : `requiresRole`, `isRequired`, `yearsOfExperienceCovers`, etc.) ne sont **pas** versionnés. Si tu modifies un helper, tu dois manuellement bumper la `version` de **toutes les assertions qui l'utilisent**.

```bash
# Workflow : qui utilise tel helper ?
git grep "requiresRole" core/search-engine/services/nl-filter-eval-cases/
# → liste des cases impactées, tu bumps à la main.
```

Le bump manuel est conscient, c'est un garde-fou cognitif (validation explicite "ce changement est significatif"). Pas de versioning auto par hash : faux positifs sur whitespace, et un helper modifié impacterait toutes les cases simultanément même si certaines n'ont pas réellement changé sémantiquement.

### 4.4 Scorer

```ts
// eval/scorers.ts
export const SCORER_NAME = 'CaseAssertions';
export const CASE_ASSERTIONS_SCORER_VERSION = 1;
```

Bumpé quand la formule du scorer change (ex: passer de `passed/total` à du pondéré par catégorie). Préfixé pour future-proofing si on ajoute un 2e scorer un jour.

## 5. Phase 1 — Foundation (commit 1)

### 5.1 But

Architecture DB-only en place et **rescore-on-run fonctionnel**. Le runner écrit dans `eval.db`, le cache filesystem est absorbé, et la sémantique append-only via `INSERT OR IGNORE` fait que le rescore "marche tout seul" dès qu'on relance un eval après un bump : nouveaux `(assertion_id, version)` ⇒ nouvelles rows dans `assertion_results` ; nouveau fingerprint ⇒ nouvelle row dans `trial_scores`. Pas de logique de bump-detection à coder — elle émerge naturellement des UNIQUE constraints.

Phase 2 sera plus thin : commande de rescore **rétroactive** (sans relancer un run) + docs README + tests d'intégration sur le workflow de bump.

### 5.2 Files modifiés

| File | Changement |
|---|---|
| `eval/types.ts` | `CaseAssertion` reçoit `id: string` (UUID) + `version: number`, required. Types passent en `<TOutput>` / `<TInput, TOutput>` génériques (cf §4.1). `defineCase` devient `<TInput, TOutput>(c) => c`. |
| `eval/scorers.ts` | Ajout `CASE_ASSERTIONS_SCORER_VERSION = 1`. `metadata` étendu avec `allAssertions: [{id, version, name, category, passed: bool}]` à côté de `passed/failed` (qui restent pour la console). C'est ce que `writeRunToDb` lit pour peupler `assertion_results`. Le scorer devient generic `<TOutput>`. |
| `eval/runner-loop.ts` | Ripple : `TrialResult` reçoit un nouveau champ `trialId: string` (UUID du row `trials` correspondant). `cacheStats` propage le `trial_id` du middleware vers le runner. `Subject` devient generic `<V, TInput, TOutput>` + nouvelle method `parse: (raw) => TOutput`. La branche `extraMiddlewares = opts.cacheMode ? [...] : []` (lignes 187-197) devient `extraMiddlewares = [trialCacheMiddleware({ mode: opts.cacheMode, ... })]` — toujours installé. La triple boucle `runEval()` reste inchangée. |
| `eval/runner.ts` | `writeRunSnapshot(...)` → `await writeRunToDb(runResult, runId)`. Un seul INSERT INTO runs complet post-`runEval` (pas de pré-création — le crash recovery n'est pas un besoin actuel). Le `runId` se calcule comme avant : `${run.startedAt}__${git.sha[:7]}`. `parseCacheMode` retourne désormais `'auto' \| 'write-only'` (jamais `null`) — `'auto'` est le **défaut** quand `EVAL_CACHE_MODE` n'est pas set. |
| `eval/cache/types.ts` | `CacheMode` passe de `'auto' \| 'refresh'` à `'auto' \| 'write-only'`. `'auto'` = lookup (latest by created_at) + write append. `'write-only'` = skip lookup, append toujours. |
| `eval/cache/trial-cache.ts` | `lookup`/`write` passent du filesystem à des SQL queries sur `trials`. Lookup = `WHERE (model, prompt, static, trial_index)=? AND status='success' ORDER BY created_at DESC LIMIT 1`. Write = INSERT direct (pas de UNIQUE composite, append naturel). **Toujours-on côté write** : chaque appel LLM finit dans `trials` peu importe le mode. |
| `eval/cache/trial-cache-middleware.ts` | `onHit`/`onMiss` callbacks reçoivent `trial_id: string` (UUID du row `trials`). Le runner stocke ça dans `cacheStats.trialId`. **Le mode `'refresh'` est supprimé** (remplacé par `'write-only'` qui append au lieu d'écraser). |
| `core/search-engine/services/natural-language-filter.service.eval.ts` | Le subject expose une nouvelle method `parse(raw) => filterSchema.parse(raw)` (one-liner Zod), utilisée par le rescore retroactive Phase 2. |
| `core/search-engine/services/nl-filter-eval-cases/dev-2642-python-nantes.case.ts` | Ajout d'UUIDs frais + `version: 1` sur les 5 assertions. UUIDs générés via `node -e "console.log(crypto.randomUUID())"`. |
| `core/search-engine/services/nl-filter-eval-cases/_template.case.ts` | `id: 'GENERATE_ME_RUN_NODE_E_CRYPTO_RANDOMUUID'` + commentaire pointant vers la commande. Une assertion runtime au boot (`if (id.startsWith('GENERATE_ME')) throw`) garde-fou contre l'oubli. |

### 5.3 Files ajoutés

- `eval/storage/schema.ts` — `openEvalDb()` : ouvre `eval-results/eval.db`, fait `CREATE TABLE IF NOT EXISTS` × 5, met `journal_mode = WAL`. Idempotent. Pas de migration tooling pour l'instant — si Phase 2+ change le schéma, on fera `ALTER TABLE` ad hoc ou on dropera la DB en dev (data ephemeral).
- `eval/storage/write.ts` — `writeRunToDb(runResult, runId)` : un seul INSERT INTO runs complet (run + finished_at + duration_ms en une fois) puis enchaîne les inserts dans `assertion_results` / `trial_scores`. Les rows `trials` ont déjà été insérées au fil du run par le middleware (cf §5.2 `trial-cache.ts`). Helpers internes : `insertRun`, `insertAssertionResults`, `insertTrialScore`. Tous prepared statements (SQL injection-safe).
- `eval/storage/read.ts` — helpers de lecture pour `console-output` et `dump.ts`. Toutes les queries en prepared statements.
- `eval/storage/fingerprint.ts` — `computeFingerprint(assertions: {id, version}[]): string` = sha1 du JSON.stringify trié par `id`. Utilisé par `writeRunToDb` (Phase 1) et la commande retroactive (Phase 2).
- `eval/dump.ts` — CLI : `bun eval/dump.ts <runId>`. Read-only, prepared statement (`SELECT ... WHERE id = ?`). Produit un JSON ad-hoc depuis la DB pour debug rapide / partage.

### 5.4 Files supprimés

**Pré-flight obligatoire** avant `rm` : vérifier qu'aucun import ne survit.

```bash
grep -rn "from '@eval/export\|from './export\|from '../export'" --include="*.ts" .
# → doit retourner zéro, sinon migrer ces imports vers @eval/storage/* avant de delete
```

- `eval/export.ts` (~80 lignes). Logique de formatage JSON migrée dans `eval/dump.ts`. Logique d'écriture migrée dans `eval/storage/write.ts`.

### 5.5 Notes d'implé (tags m3, m4, m5)

- **Concurrence SQLite** (m3) : le middleware fait des writes synchrones (`db.prepare(INSERT).run(...)`) pendant le run avec `pLimit(maxConcurrency=5)`. SQLite WAL serialize naturellement les writes, pas de batching nécessaire pour `maxConcurrency<=10`. Documenté en commentaire sur `upsertLlmCall`.
- **SQL injection** (m4) : tous les paths CLI/lecture (`dump.ts`, futur `sync-all.ts`) passent par `db.prepare('... WHERE x = ?').get(value)`. Jamais de string concat dans une query.
- **Migrations futures** (m5) : pas de tooling dédié dans Phase 1. Si Phase 2+ ajoute une colonne, `ALTER TABLE` (SQLite supporte). Si ça devient récurrent, on introduira une table `schema_version` + migrations versionnées. YAGNI tant qu'on n'a qu'un schéma.

### 5.6 Test plan Phase 1

- [ ] `npm run eval` fresh (DB inexistante) : `eval.db` créée avec les 4 tables, peuplées avec 1 row `runs` + N rows `trials` (toutes avec `created_in_run_id` = ce run) + N×assertions rows `assertion_results` + N rows `trial_scores`. Console output identique à avant.
- [ ] `EVAL_CACHE_MODE` unset ou `=auto` re-run sans bump : 0 nouveau `trials` (cache hits), 0 nouveau `assertion_results`/`trial_scores` (INSERT OR IGNORE no-op). Score identique.
- [ ] `EVAL_CACHE_MODE=auto` re-run **après bump** d'une assertion (`version: 1 → 2`) : 0 nouveau `trials`, +1 row `assertion_results` par trial pour cette assertion, +1 row `trial_scores` par trial (nouveau fingerprint). Score reflète la v2.
- [ ] `EVAL_CACHE_MODE=auto` re-run **après ajout** d'une assertion : 0 nouveau `trials`, +1 row `assertion_results` par trial (nouvelle `id`), +1 row `trial_scores` par trial. Score reflète le nouveau ratio.
- [ ] `EVAL_CACHE_MODE=auto` re-run **après suppression** : 0 nouveau dans `assertion_results` (les anciens restent), +1 row `trial_scores` par trial (fingerprint sans cette id), score reflète la suppression.
- [ ] `EVAL_CACHE_MODE=write-only` : skip lookup, +N nouveaux rows `trials` (append fresh observations même si key existe déjà). Le cache lookup ultérieur en `auto` retournera les rows write-only via `ORDER BY created_at DESC`.
- [ ] `EVAL_CACHE_MODE=refresh` est rejeté par `parseCacheMode` avec une erreur claire (mode supprimé en v3.2).
- [ ] Trial avec `status='fail'` (LLM error ou parse error) : row `trials` écrite avec `status='fail'` + `error` rempli, `output_raw` NULL. Pas d'`assertion_results`/`trial_scores`. Pas de cache hit ultérieur sur ce row (cache lookup filtre `status='success'`).
- [ ] `bun eval/dump.ts <runId>` retourne un JSON structurellement proche des anciens snapshots (clés top-level identiques : `schemaVersion`, `runId`, `git`, `pricing`, `variants[].cases[].trials[]`).
- [ ] `bun eval/dump.ts "x'; DROP TABLE runs; --"` : prepared statement protège, no-op (juste un SELECT vide).
- [ ] Tests unitaires sur `storage/schema.ts` + `storage/write.ts` + `storage/fingerprint.ts` (idempotence, ON CONFLICT, JOINs basiques, fingerprint stable sur ordre des assertions).
- [ ] `npm test` global passe.

### 5.7 Commit message Phase 1

```
refactor(eval): DB-only storage with append-only trials + rescore-on-run

Replace JSON snapshot authoring with SQLite (eval-results/eval.db, 4 tables:
runs, trials, assertion_results, trial_scores). Absorb the filesystem trial
cache into the trials table — same cache key (model, prompt_sha, static_hash,
trial_index) but no UNIQUE constraint, so multiple revisions can coexist
ordered by created_at. Cache lookup = ORDER BY created_at DESC LIMIT 1.

EVAL_CACHE_MODE simplified: 'auto' (default) does lookup+write; 'write-only'
skips lookup, always appends. 'refresh' is removed (replaced by 'write-only'
which appends instead of overwriting).

Trials carry their context inline: case_id, variant_name, created_in_run_id,
plus full telemetry (provider, finish_reason, tokens, cost, latency, status).
No separate trial_observations table — per-run cache_hit stats are runtime-only
(in RunResult, not persisted), aligned with display preferences.

Add `id` (UUID) + `version` (int) on each CaseAssertion. The scorer's metadata
carries `allAssertions[{id, version, name, category, passed}]` so the storage
layer persists per-assertion results without re-running checks.

Generic type system: EvalCase<TInput, TOutput>, CaseAssertion<TOutput>,
Subject<V, TInput, TOutput>. The Subject exposes a `parse(raw) => TOutput`
method used by the retroactive sync in the follow-up commit, so we store only
the raw provider response in trials.output_raw and reconstitute the parsed
form on demand — no staleness on schema evolution.

Add CASE_ASSERTIONS_SCORER_VERSION = 1. Per-trial scores are keyed by
`(trial_id, scorer_name, scorer_version, assertion_set_fingerprint)` —
bumping an assertion produces a new fingerprint and naturally appends a new
row. Bump-detection is implicit: INSERT OR IGNORE handles add/modify/remove
cases for free.

The cache middleware is always installed (no more conditional based on mode).
Drop eval/export.ts; add eval/dump.ts for ad-hoc JSON exports from the DB.
evalite is no longer used at runtime.
```

## 5b. Cleanup filesystem + evalite uninstall (commit intermédiaire)

Commit séparé après validation de Phase 1, avant Phase 2. Permet un revert facile de Phase 1 sans perdre les anciens artefacts au passage.

### 5b.1 Cleanup filesystem

```bash
rm -rf eval-results/runs/                 # 1.4 MB de JSON snapshots, archive legacy
rm -rf eval-results/cache/                # 352 KB de cache filesystem, absorbé en DB
rm eval-results/evalite.db                # 924 KB vestige evalite
```

### 5b.2 evalite uninstall

```bash
npm uninstall evalite
rm patches/evalite+1.0.0-beta.16.patch
# + retirer le champ evaliteVersion de eval/cache/types.ts (ligne 19) et trial-cache-middleware.ts (ligne 14, 77)
```

### 5b.3 Commit message

```
chore(eval): remove evalite dep + legacy filesystem artifacts

Phase 1 of the rescore work made evalite runtime-dead and replaced JSON
snapshots + filesystem cache with SQLite. This commit removes the leftover
artifacts:
- npm uninstall evalite
- rm patches/evalite+1.0.0-beta.16.patch
- rm eval-results/{runs,cache,evalite.db}
- Drop the unused `evaliteVersion` metadata field from cache types and middleware

No behavioral change. Diff is purely deletions + the metadata field cleanup.
```

## 6. Phase 2 — Retroactive sync + docs (commit 3)

### 6.1 But

Phase 1 fait déjà le rescore "on next run". Phase 2 ajoute la commande **retroactive** pour rescorer sans relancer un eval (utile quand tu bumps une assertion mais ne veux pas attendre un run complet) + le polish autour : README, examples SQL, tests d'intégration sur le workflow de bump.

### 6.2 Algorithme retroactive

```
sync_retroactive(subject):
  current_assertions = scan eval/<subject>-eval-cases/*.case.ts
                       → Map<caseId, [{id, version, category, check}]>
  current_scorer_version = CASE_ASSERTIONS_SCORER_VERSION

  # Scan tous les trials successful de la DB
  for each (trial_id, case_id, output_raw) in
      SELECT id, case_id, output_raw
      FROM trials
      WHERE status = 'success':

    if case_id not in current_assertions: continue   # case supprimé, skip + warn

    case_assertions = current_assertions.get(case_id)

    # 1. Reconstituer la forme parsée depuis le raw stocké
    try:
      parsed = subject.parse(JSON.parse(output_raw))
    catch err:
      log.warn(`[sync] parse failed on trial ${trial_id}: ${err.message}`)
      continue   # skip ce trial, on n'a pas de TOutput à passer aux check()

    # 2. Pour chaque (id, version) actuel pas encore en assertion_results : run le check
    for assertion in case_assertions:
      already = SELECT 1 FROM assertion_results
                WHERE trial_id = ? AND assertion_id = ? AND assertion_version = ?
      if not already:
        passed = assertion.check(parsed)   # pure CPU, 0 LLM call
        INSERT INTO assertion_results (...)

    # 3. Si fingerprint inédit pour ce trial_id : INSERT trial_scores
    fingerprint = computeFingerprint(case_assertions)
    INSERT OR IGNORE INTO trial_scores (...)
```

Différence vs Phase 1 : ici on **rejoue les `check()`** sur `parsed` reconstitué depuis `output_raw` via `subject.parse(...)`, parce qu'on n'a pas le `RunResult` en mémoire (pas de run en cours). Coût pure CPU, idempotent via UNIQUE. Si le parser du subject a évolué entre Phase 1 et l'invocation retroactive, la reconstitution utilise **automatiquement le nouveau parser** — c'est exactement ce qu'on veut.

### 6.3 Files ajoutés

- `eval/rescore/sync-all.ts` — CLI : `bun eval/rescore/sync-all.ts`. Algo ci-dessus.
- `eval/rescore/sync-all.test.ts` — tests unitaires + intégration.

### 6.4 Files modifiés

- `eval/README.md` — section "Adding/modifying an assertion" (UUID generation, bump rule), section "Modifying a helper" (règle manuelle), section "Reading scores from the DB" (exemples SQL : cost then/now, score evolution sur 2 versions, qui passe/échoue par assertion).

### 6.5 Test plan Phase 2

- [ ] `bun eval/rescore/sync-all.ts` sur DB où Phase 1 a tout peuplé : 0 nouveau row (idempotent).
- [ ] Bump d'une assertion `version: 1 → 2`, puis `sync-all.ts` : +1 row `assertion_results` par trial existant + 1 nouveau `trial_scores` par trial.
- [ ] Ajout d'une assertion, puis `sync-all.ts` : pareil, +1 row par trial.
- [ ] Suppression, puis `sync-all.ts` : 0 nouveau dans `assertion_results`, +1 nouveau fingerprint dans `trial_scores`.
- [ ] Case supprimé du filesystem mais avec `trials` historiques : log warn, skip, 0 INSERT.
- [ ] `output_raw` corrompu (JSON parse fail) sur un trial : log error, skip, pas de crash.
- [ ] Workflow end-to-end : run → bump → `sync-all.ts` → `dump.ts` montre les 2 fingerprints côte à côte.

### 6.6 Commit message Phase 2

```
feat(eval): retroactive rescore command + workflow docs

Add `bun eval/rescore/sync-all.ts` to rescore historical trials without
relaunching a full eval run. Useful when you bump an assertion and want the
score evolution visible immediately, without paying the cost of even a
cache-only re-run.

The auto rescore on next run (already shipped in the previous commit) covers
the typical workflow ; sync-all.ts is the escape hatch for "I want it now".

README updated:
- Adding/modifying an assertion (UUID generation, bump rule)
- Modifying a helper (manual bump rule)
- Reading scores from the DB (SQL examples: cost-at-then vs cost-at-now,
  score evolution over assertion versions, per-assertion pass/fail audit)
```

## 7. Décisions tranchées (consolidées)

1. **Versioning par assertion individuelle** (pas par case). Chaque assertion a son `id` UUID + `version` int.
2. **`name` est libre** (libellé humain), `id` est l'identifiant stable.
3. **Helpers non versionnés** — règle manuelle, bump à la main les assertions impactées (`git grep` du nom du helper).
4. **DB-only** — `eval.db` est l'unique source de vérité. Pas de JSON authoring, pas de cache filesystem séparé.
5. **Identité trial = `trials.id` UUID**, pas le `runId`. Le runId est tracé sur `trials.created_in_run_id` (qui run a fait le fresh call), pas dans les tables de scoring.
6. **Cache absorbé** dans `trials`. Le middleware fait des SQL queries au lieu de FS reads.
7. **Append-only** : on insère, jamais on update/delete. **Pas de UNIQUE composite** sur `trials` — l'`id` PRIMARY KEY suffit. Multi-revision possible via `created_at`.
8. **Pas de JSON authoring** — `eval-results/runs/*.json` n'est plus écrit. `bun eval/dump.ts` génère un JSON ad-hoc à la demande pour debug/partage.
9. **Bump-detection implicite** via INSERT OR IGNORE sur `assertion_results` / `trial_scores` — pas de logique dédiée à coder. Add/modify/remove traités uniformément par les contraintes du schéma.
10. **Sync = pure writer en Phase 1** (lit `RunResult` en mémoire post-`runEval`). **Sync retroactive en Phase 2** (rejoue les `check()` sur `output_raw` re-parsé via `subject.parse()`, pour le cas où on bumpe sans relancer un run).
11. **Cache middleware always-on côté write** : `cacheMode` ne contrôle que le lookup. Tous les LLM calls finissent dans `trials`, peu importe le mode.
12. **Drop `cacheMode='refresh'`** au profit de `'write-only'` (append au lieu d'écraser). Default = `'auto'`.
13. **Generics `EvalCase<TInput, TOutput>` + `Subject<V, TInput, TOutput>` + `Subject.parse(raw): TOutput`** : permettent de tester n'importe quel subject avec n'importe quelle forme d'input/output. NL filter actuel se type `Subject<MyVariant, string, NormalizedFilterType[]>`.
14. **`output_raw` seul dans `trials`** : pas de `output_parsed` ni `parse_error` stockés. Le parsed se reconstitue à la demande via `subject.parse()` ; les erreurs de parse vivent dans `trials.error` (rempli quand `status='fail'`). Évite la staleness sur évolution du parser du subject.
15. **Un seul `INSERT INTO runs` post-runEval** (pas de pré-création + UPDATE). Crash recovery non-bloquant : si `npm run eval` plante, on n'a pas de row `runs` mais les `trials` insérés au fil de l'eau restent récupérables manuellement.
16. **Pas de table `trial_observations`** : le contexte (`case_id`, `variant_name`, `created_in_run_id`) vit directement sur `trials`. Le `cache_hit` per-run n'est pas persisté — disponible runtime via `RunResult.trial.cacheHit` mais pas en DB. Aligné avec `feedback_eval_results_display.md` ("pas d'info cache"). Schéma à 4 tables au lieu de 5.

## 8. Edge cases

| Cas | Comportement |
|---|---|
| Case supprimé depuis le run | `assertion_results` + `trial_scores` historiques préservés. Le case n'a juste plus de futur scoring. Pas de cascade delete. |
| Assertion supprimée d'un case | Rows historiques préservés. Nouveau fingerprint sans cette `id` ⇒ nouveau `trial_scores` recalculé. |
| Assertion ajoutée | Nouveau row dans `assertion_results` au prochain run + 1 nouveau fingerprint dans `trial_scores`. |
| Bump `version` sans changement de `check` (oubli inverse) | Sync recalcule, INSERT row identique sauf `assertion_version`. Idempotent. |
| `check` modifié sans bump (oubli direct) | **Bug silencieux** : sync croit le row à jour. Mitigation : revue PR + diff sur le case file rend le bump évident. |
| Helper modifié sans bump des assertions | Idem bug silencieux. Mitigation manuelle (§4.3). |
| Trial `status='fail'` (LLM error ou parse error) | Row `trials` écrite avec `status='fail'` + `error` rempli + `output_raw=NULL`. Pas d'`assertion_results`/`trial_scores`. Le cache lookup filtre `WHERE status='success'` donc ce row n'est jamais réutilisé en cache hit ; un futur run avec même clé fera un fresh call. |
| 2 process `npm run eval` concurrents | SQLite WAL serialize les writes. Le 2e wait. Pas de race. |
| Parser du subject évolue (schéma change) | Phase 1 (run frais) : nouveau parsing applique direct, nouveau parsed → assertions check OK. Phase 2 (retroactive) : `subject.parse(output_raw)` utilise le parser courant, donc reflète automatiquement le nouveau schéma. Si l'ancien `output_raw` ne valide plus → log warn + skip ce trial dans le retroactive. |
| Cache hit cross-run | Pas de nouveau row `trials` ; `assertion_results`/`trial_scores` réutilisés (ou nouvelles rows si fingerprint a changé entre les 2 runs). Le 2e run n'a pas de trace persistée du hit (info dispo runtime via `RunResult` seulement). |
| `EVAL_CACHE_MODE=refresh` invoqué | `parseCacheMode` rejette avec une erreur claire (mode supprimé en v3.2, remplacé par `'write-only'` qui append). |
| `EVAL_CACHE_MODE=write-only` invoqué | Skip lookup, INSERT systématique → nouvelle row `trials` à chaque appel LLM même si key existe. La row la plus récente (par `created_at`) sera retournée par les futurs lookups en `auto`. |

## 9. Anticipations (futures phases)

### 9.1 Outil de diff

Une fois l'append-only en place, le diff entre 2 versions d'assertions est trivial :

```bash
bun eval/rescore/diff.ts --case dev-2642-python-nantes
# → Compare les 2 dernières fingerprints de trial_scores pour ce case.
# → Affiche les trials qui ont flippé (pass↔fail) entre les deux fingerprints,
#   avec le delta de score par variant.

bun eval/rescore/diff.ts --assertion <uuid>
# → Compare les versions accumulées de cette assertion sur tous les trials.
#   Utile pour valider qu'une modif de helper n'a pas eu d'effet de bord.
```

Pas dans cette PR. Documenté pour mémoire.

### 9.2 Variant UUID

Aujourd'hui `variant_name` est juste un string ('gpt-4.1', etc.). Si on rename un variant, tous les `trials.variant_name` deviennent stale. Out of scope, mais à garder en tête : à terme, un `variants` table avec UUID pourrait être nécessaire pour le même genre d'audit que `assertions.id`.

### 9.3 Migration totale custom

`eval/cache/DESIGN.md` §11.7 évoque une bascule complète vers un orchestrateur custom. Avec la Phase 1 + 2 mergées, ce chantier devient cosmétique : tous les data flows passent déjà par notre code, evalite est uninstall, plus rien à migrer côté données.
