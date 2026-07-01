# Variant Axes & Storage Normalization — Design

> Statut : **acté, non implémenté.** Cette spec décrit ce qui a été décidé en design review (mai 2026) avant l'écriture du code. À mettre à jour au fil de l'implémentation, et à conserver comme référence historique une fois mergé.

---

## 1. Contexte et motivation

### Le besoin

Aujourd'hui un *variant* (eval.ts:68-72) est défini par 3 champs :

```ts
export type EvalVariant = { name: string; provider: Provider; modelId: string };
```

Une variant = un model, point. On veut élargir : tester **plusieurs configurations** dans le même run, par exemple :

- `gpt-5` avec `reasoning_effort=high` vs `reasoning_effort=low`
- `claude-opus-4-7` avec `thinking.budget_tokens=16384` vs sans thinking
- À terme : différents systemPrompts, différents `temperature`, `topP`, etc.

L'objectif est de **comparer ces axes de configuration dans le même run**, avec persistance qui permet de re-déduire toute vue future sans re-rappeler le LLM.

### Le principe directeur : persistance native, pas d'abstraction

On stocke ce qu'on a effectivement envoyé au provider. Pas de table de mapping `effort: 'high' → budget: 16384`. Le `reasoning_effort` OpenAI et le `thinking.budget_tokens` Anthropic sont **deux choses différentes** ; on les persiste telles quelles, et on déduit a posteriori si on veut les comparer.

Alignement avec les patterns existants :

- `runs.pricing_table_json` (schema.ts:21) — freeze ce qu'on contrôle, recalcul possible plus tard.
- `trials.output_raw` (schema.ts:36) — payload brut du LLM, permet rescore sans re-call.
- `assertion_results.assertion_id` (schema.ts:56) — stable ID, pas le texte.

### Vocabulaire

| Terme | Définition |
|---|---|
| **Variant** | Une combinaison de tous les axes (provider, modelId, systemPrompt, providerOptions...). Identité = hash du contenu. |
| **Axis** | Une dimension de configuration au sein d'un variant. Exemples : `reasoningEffort` (OpenAI), `thinkingBudgetTokens` (Anthropic), `temperature`, `topP`, `systemPrompt`. |
| **Variant name** | Label humain (`"gpt-4.1"`, `"opus-4-7-thinking-high"`). Pour affichage. Différent de l'identité technique. |

Une variant = bundle d'axes. Le nom est un label, l'identité est un hash content-addressed.

---

## 2. Décisions actées

| # | Décision | Rationale |
|---|---|---|
| D1 | Discriminated union sur `provider` pour `EvalVariant` | TS empêche `thinkingBudgetTokens` sur OpenAI et vice-versa. Pas d'abstraction. |
| D2 | Snapshot du dict `params` complet (3e voie), pas d'énumération d'axes | Aucune migration de schéma quand on ajoute un nouvel axis. `null` = "default provider appliqué". |
| D3 | Nouvelle table `system_prompts` content-addressed par `id = sha256(text)` | Déduplication des prompts entre runs. Stable ID. |
| D4 | Nouvelle table `variant_configs` content-addressed par `id = sha256({provider, model_id, system_prompt_id, provider_options_json canonicalisé})` | Déduplication des configs entre runs. 6 configs uniques au lieu de 102 rows. |
| D5 | Ajout `trials.variant_config_id TEXT REFERENCES variant_configs(id)` | Lien depuis chaque trial vers sa config. |
| D6 | Drop `runs.system_prompt_text` et `runs.system_prompt_sha256` après backfill | Devient un mensonge silencieux si variants ont des prompts différents. La source de vérité passe à `system_prompts` ↔ `variant_configs`. |
| D7 | Pas de table `run_variants` intermédiaire | `(trials.created_in_run_id, trials.variant_name)` suffit pour reconstruire la manifeste d'un run. |
| D8 | Naming convention : PK = `id`, FK = `<table>_id` | Aligné avec le schéma existant (`runs.id`, `trials.id`, etc.). |
| D9 | Hash content-addressed distinct du `static_hash` existant | Ils répondent à deux questions : `static_hash` = "ce CALL est-il identique" (cache), `variant_configs.id` = "cette CONFIG est-elle la même" (identité variant). Schema de structured output dans `static_hash` mais pas dans `variant_configs.id`. |

---

## 3. Schéma DB

> **Création automatique vs migration data** : les tables et colonnes décrites ci-dessous vivent dans `SCHEMA_SQL` (`eval/storage/schema.ts:7`) — créées idempotemment par `openEvalDb()` au premier accès via `CREATE TABLE IF NOT EXISTS`. Le script de migration (§7) ne **crée pas** les tables, il se charge uniquement du **backfill data** et du **DROP COLUMN**. Cette distinction garantit qu'un nouveau clone du repo a le schéma cible sans avoir à jouer une migration.
>
> Cas particulier : `ALTER TABLE trials ADD COLUMN variant_config_id` n'a pas d'équivalent `IF NOT EXISTS` en SQLite. C'est géré par un helper `ensureVariantConfigIdColumn(db)` qui check `PRAGMA table_info(trials)` et fait l'ALTER si la colonne manque — invoqué après `db.exec(SCHEMA_SQL)` dans `openEvalDb()`.

### Tables nouvelles

```sql
-- Table d'index des system prompts. Content-addressed : id = sha256(text).
-- Permet déduplication entre runs et stable ID pour des comparaisons cross-run.
CREATE TABLE system_prompts (
  id TEXT PRIMARY KEY,            -- content-addressed : id = sha256(text)
  text TEXT NOT NULL,
  first_seen_at TEXT NOT NULL     -- ISO timestamp, quand ce prompt est apparu pour la 1ère fois
);

-- Table d'index des configs de variant. Content-addressed :
-- id = sha256(canonicalize({provider, model_id, system_prompt_id, provider_options_json})).
-- Une config = une combinaison d'axes. Partagée entre runs qui réutilisent la même config.
CREATE TABLE variant_configs (
  id TEXT PRIMARY KEY,            -- content-addressed (voir helper canonicalize+hash dans le code)
  provider TEXT NOT NULL,         -- 'openai' | 'anthropic' (dénormalisé pour requêtes directes sans parse JSON)
  model_id TEXT NOT NULL,         -- ex. 'gpt-4.1', 'claude-opus-4-7'
  system_prompt_id TEXT NOT NULL REFERENCES system_prompts(id),
  provider_options_json TEXT,     -- snapshot complet du params dict (sampling + providerOptions), peut être NULL si rien spécifié
  first_seen_at TEXT NOT NULL
);

CREATE INDEX idx_variant_configs_prompt ON variant_configs (system_prompt_id);
CREATE INDEX idx_variant_configs_model ON variant_configs (model_id);
```

### Modification table `trials`

```sql
ALTER TABLE trials ADD COLUMN variant_config_id TEXT REFERENCES variant_configs(id);
CREATE INDEX idx_trials_variant_config ON trials (variant_config_id);
```

`trials.variant_name` reste (label humain). `variant_config_id` est l'identité technique. La paire `(trials.variant_name, trials.variant_config_id)` permet l'affichage + le lookup.

### Suppression dans `runs` (après backfill)

```sql
ALTER TABLE runs DROP COLUMN system_prompt_text;
ALTER TABLE runs DROP COLUMN system_prompt_sha256;
```

> **Pré-requis SQLite : `DROP COLUMN` natif requiert SQLite ≥ 3.35.0 (mars 2021).** Vérifié : `better-sqlite3` embarque actuellement SQLite 3.49.2 dans ce projet. ✓

### Schéma cible (résumé visuel)

```
runs
  id PK
  started_at, finished_at, duration_ms
  git_sha, git_dirty, dataset_hash
  eval_file, cases_dir, subject_name
  pricing_table_json, pricing_verified_at
  -- ❌ system_prompt_text (dropped)
  -- ❌ system_prompt_sha256 (dropped)

trials
  id PK
  model_id, provider
  prompt_sha, static_hash (inchangés, pour cache)
  trial_index
  case_id, case_slug_at_creation
  variant_name                          -- ← label humain
  variant_config_id → variant_configs.id  -- ← identité technique (NEW)
  created_in_run_id → runs.id
  output_raw, output_hash, finish_reason
  tokens_input, tokens_output, tokens_total
  estimated_cost_usd, latency_ms
  status, error, created_at

variant_configs (NEW)
  id PK = sha256({provider, model_id, system_prompt_id, provider_options_json canonicalisé})
  provider, model_id
  system_prompt_id → system_prompts.id
  provider_options_json
  first_seen_at

system_prompts (NEW)
  id PK = sha256(text)
  text
  first_seen_at

assertion_results, trial_scores : inchangés.
```

---

## 4. Types code (`eval/types.ts` et `eval.ts` subject-side)

### `EvalVariant` — discriminated union par provider

Dans `core/search-engine/services/natural-language-filter.service.eval.ts` :

```ts
export type EvalVariant =
  | {
      name: string;
      provider: 'openai';
      modelId: string;
      // OpenAI o-series et gpt-5 supportent reasoning_effort.
      // gpt-4.1-* et gpt-4o-* l'ignorent silencieusement (vérifier la doc avant prod).
      reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    }
  | {
      name: string;
      provider: 'anthropic';
      modelId: string;
      // Anthropic Opus 4.6/4.7 supporte extended thinking via thinking.budget_tokens.
      // Absent = feature OFF (réponse sans bloc thinking).
      thinkingBudgetTokens?: number;
    };
```

### Helpers de canonicalisation et hash

Nouveau fichier `eval/storage/variant-config-id.ts` :

```ts
import { createHash } from 'node:crypto';

/** Canonicalise un objet pour qu'il soit hash-déterministe : tri récursif des
 *  clés. Sans ça, `JSON.stringify({a:1,b:2})` ≠ `JSON.stringify({b:2,a:1})`. */
export const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
};

const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

/** Calcule l'id content-addressed de variant_configs. */
export const computeVariantConfigId = (input: {
  provider: string;
  modelId: string;
  systemPromptId: string;
  providerOptionsJson: string | null;  // déjà canonicalisé OU null
}): string =>
  sha256(
    canonicalize({
      provider: input.provider,
      modelId: input.modelId,
      systemPromptId: input.systemPromptId,
      providerOptionsJson: input.providerOptionsJson,
    }),
  );

/** Calcule l'id content-addressed de system_prompts. */
export const computeSystemPromptId = (text: string): string => sha256(text);
```

---

## 5. Plumbing dans `runOne`

`core/search-engine/services/natural-language-filter.service.eval.ts:103-136` doit lire les axes du variant et les injecter dans le call.

### Mapping reasoningEffort / thinkingBudgetTokens → providerOptions

Dans `runOne`, après détermination du provider :

```ts
const buildProviderOptions = (variant: EvalVariant): Record<string, unknown> | undefined => {
  if (variant.provider === 'openai') {
    if (variant.reasoningEffort === undefined) return undefined;
    return { openai: { reasoningEffort: variant.reasoningEffort } };
  }
  // Anthropic
  const anthropicOpts: Record<string, unknown> = { structuredOutputMode: 'jsonTool' };
  if (variant.thinkingBudgetTokens !== undefined) {
    anthropicOpts.thinking = {
      type: 'enabled',
      budget_tokens: variant.thinkingBudgetTokens,
    };
  }
  return { anthropic: anthropicOpts };
};
```

Note : pour Anthropic, on garde `structuredOutputMode: 'jsonTool'` toujours (sinon le schema Zod relax-failure se déclenche, déjà documenté eval.ts:34-43). Le thinking s'ajoute en plus, ne le remplace pas.

### Injection dans le middleware chain

```ts
const middlewares: LanguageModelV3Middleware[] = [
  telemetryMiddleware(sink),
  defaultSettingsMiddleware({
    settings: {
      providerOptions: buildProviderOptions(variant),
    },
  }),
  ...extraMiddlewares,
];
```

Remplace l'usage actuel de `anthropicJsonToolSettings` (eval.ts:37-43) — le nouveau helper gère uniformément openai/anthropic.

---

## 6. Calcul et plumbing de `variant_config_id`

### Timing : avant le call, pas après

Le `variant_config_id` est calculé **avant** l'appel LLM, depuis les axes du variant et le system prompt utilisé. Trois raisons :

1. **Pas de chicken-and-egg.** `insertTrial` (trial-cache.ts:96-131) écrit la row trial à la fin du call. Si on attendait un snapshot post-call pour calculer le hash, il faudrait insérer avec NULL puis UPDATE — flow plus complexe et fragile.
2. **Déterminisme.** La config est définie par le **variant** (le contrat dans `eval.ts`), pas par ce que le middleware AI SDK aurait pu reformuler à la marge. Le hash doit refléter le contrat, pas l'effet de bord.
3. **Reproducibilité.** On peut recalculer un `variant_config_id` historique depuis le code seul (la définition du variant à l'époque), sans avoir à inspecter le payload AI SDK.

### Source de vérité pour le hash

```ts
// Dans eval/storage/variant-config-id.ts (avec les autres helpers)
export const computeVariantConfigIdForVariant = (
  variant: EvalVariant,
  systemPrompt: string,
): { configId: string; systemPromptId: string; providerOptionsJson: string | null } => {
  const systemPromptId = computeSystemPromptId(systemPrompt);
  const providerOptions = buildProviderOptions(variant);  // déterministe depuis le variant
  const providerOptionsJson = providerOptions
    ? canonicalize(providerOptions)
    : null;
  const configId = computeVariantConfigId({
    provider: variant.provider,
    modelId: variant.modelId,
    systemPromptId,
    providerOptionsJson,
  });
  return { configId, systemPromptId, providerOptionsJson };
};
```

Exemple de `provider_options_json` persisté pour un variant `claude-opus-4-7-thinking-high` :

```json
{
  "anthropic": {
    "structuredOutputMode": "jsonTool",
    "thinking": { "budget_tokens": 16384, "type": "enabled" }
  }
}
```

**Règle de lecture** : `null` ou champ absent = "on n'a rien spécifié, le provider a appliqué SA default au moment du call". On ne persiste pas les defaults provider (hors de notre contrôle).

### Plumbing du flow d'écriture

**`TrialContext` (trial-cache.ts:7-16) gagne un champ** :

```ts
export type TrialContext = {
  caseId: string;
  caseSlug: string;
  variantName: string;
  variantConfigId: string;       // ← NEW : id content-addressed de la config
  createdInRunId: string;
  provider: string;
  trialIndex: number;
};
```

**`INSERT_SQL` (trial-cache.ts:55-67) gagne une 22e colonne `variant_config_id`**. La row trial est self-describing : on connaît l'identité de la config dès l'insertion, pas après UPDATE.

**Le runner (runner-loop.ts:213-308) fait, AVANT la boucle `Promise.all` de jobs** :

1. Pré-calcule pour chaque `variant` du subject :
   ```ts
   const { configId, systemPromptId, providerOptionsJson } =
     computeVariantConfigIdForVariant(variant, subject.systemPrompt);
   ```
2. `INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at) VALUES (systemPromptId, subject.systemPrompt, now)`.
3. `INSERT OR IGNORE INTO variant_configs (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at) VALUES (configId, ..., now)`.
4. Stocke `configId` dans un `Map<variant.name, string>` pour injection dans `TrialContext` à chaque job.

Les inserts dans `system_prompts` + `variant_configs` se font **en amont** des trials, jamais pendant. Au moment de chaque insert trial, la FK `variant_config_id → variant_configs.id` est garantie.

### Snapshot middleware — hors scope du commit 1

La V0 de cette spec proposait un `paramsSnapshotMiddleware` qui capturait les params AI SDK au moment du call pour les persister. **Pas nécessaire** pour le commit 1, parce que le hash est calculé depuis le variant (pas depuis le snapshot post-call).

Le snapshot pourrait servir plus tard à **valider** que ce qu'on a effectivement envoyé matche ce qu'on attendait depuis le variant — un middleware qui hash le `params` dict effectivement vu, le compare au `providerOptionsJson` du `variant_config_id` correspondant, alerte si divergence. Nice-to-have, PR séparée si besoin réel.

---

## 7. Backfill (migration des données historiques)

### Pré-conditions

À jour de mai 2026 : 17 runs existants. Tous avec :
- Un systemPrompt global (eval.ts:101 : `buildNlFilterSystemPrompt()` sans paramètre).
- Anthropic calls : `providerOptions.anthropic.structuredOutputMode = 'jsonTool'` (eval.ts:37-43).
- OpenAI calls : aucun `providerOptions` spécifié.
- Aucun thinking activé.

### Préalable schéma (déjà fait par `SCHEMA_SQL` + `ensureVariantConfigIdColumn`)

Avant que ce script tourne, on suppose que :
- Tables `system_prompts` et `variant_configs` existent (créées par `SCHEMA_SQL`).
- Colonne `trials.variant_config_id` existe (créée par le helper `ensureVariantConfigIdColumn(db)` invoqué dans `openEvalDb()`).

Ce script ne crée **rien** au niveau schéma — il fait uniquement **backfill data + DROP COLUMN**.

### Atomicité — tout dans une transaction unique

Fichier : `eval/storage/migrations/001-variant-configs.ts` (à créer).

Toutes les étapes ci-dessous tournent dans une transaction unique :

```ts
db.transaction(() => {
  // étapes 1-5 ci-dessous
})();
```

Si une étape échoue, rollback complet → état pré-migration intact. Pas de "moitié migré" possible (par exemple : data backfilled mais colonnes `runs.system_prompt_*` non droppées). better-sqlite3 supporte les transactions imbriquées via SAVEPOINT, donc safe à appeler depuis n'importe quel call site (y compris si le runner ouvre déjà une transaction post-PR).

### Étapes (à l'intérieur de la transaction)

```
1. INSERT OR IGNORE INTO system_prompts (id, text, first_seen_at)
   SELECT system_prompt_sha256, system_prompt_text, MIN(started_at)
   FROM runs
   GROUP BY system_prompt_sha256;
   (MIN(started_at) → first_seen_at chronologiquement correct, déterministe quel que soit l'ordre d'itération.)

2. Inférer les configs uniques + leur `first_seen_at` déterministe :

   ```sql
   -- SELECT en TS, calcul de config_id par row, puis INSERT OR IGNORE
   SELECT
     t.provider,
     t.model_id,
     r.system_prompt_sha256 AS system_prompt_id,
     MIN(r.started_at) AS first_seen_at,
     -- la trial.run_id sert seulement à grouper, on prend MIN(started_at) sur le groupe
     t.variant_name  -- gardé pour l'étape 4 ci-dessous
   FROM trials t
   JOIN runs r ON r.id = t.created_in_run_id
   GROUP BY t.provider, t.model_id, r.system_prompt_sha256;
   ```

   Pour chaque row de ce SELECT :
   - 2.1 `providerOptionsJson` selon `provider` :
     - `'anthropic'` → `canonicalize({ anthropic: { structuredOutputMode: 'jsonTool' } })`
     - `'openai'`    → `null`
   - 2.2 `variantConfigId := computeVariantConfigId({ provider, modelId, systemPromptId, providerOptionsJson })`.
   - 2.3 `INSERT OR IGNORE INTO variant_configs (id, provider, model_id, system_prompt_id, provider_options_json, first_seen_at) VALUES (variantConfigId, provider, modelId, systemPromptId, providerOptionsJson, first_seen_at)`.
     → `first_seen_at = MIN(started_at)` du groupe (déterministe quel que soit l'ordre d'itération).

3. UPDATE des trials avec leur variant_config_id :

   Pour chaque trial existante, on calcule son `variant_config_id` à partir de son `(provider, model_id, system_prompt_id)` (lecture via JOIN runs), puis :

   ```sql
   UPDATE trials SET variant_config_id = ?
   WHERE id = ?;
   ```

   Alternative SQL-pure (faisable si on extrait le calcul de `variantConfigId` côté TS d'abord puis on l'écrit dans une table temporaire) — flexibilité d'implémentation, le DOD §10 sanity vérifie le résultat indépendamment.

4. Vérifications (sanity SQL ci-dessous, sous-section "Validation post-migration"). Si une fail → throw → transaction rollback.

5. ALTER TABLE runs DROP COLUMN system_prompt_text;
   ALTER TABLE runs DROP COLUMN system_prompt_sha256;
```

> **Cohérence backfill ↔ live** : la canonicalization utilisée ici DOIT être identique à celle de `buildProviderOptions(variant)` post-PR. Sans ça, un variant Anthropic existant et son équivalent dans un nouveau run produiraient deux `variant_config_id` différents → bug silencieux de déduplication. Test unitaire requis : `computeVariantConfigId` sur un historical pair (Anthropic, gpt-4o-mini, etc.) doit donner le même id que `computeVariantConfigIdForVariant(currentVariant, currentSystemPrompt)`.

### Idempotence

Tout `INSERT OR IGNORE` + `UPDATE ... WHERE variant_config_id IS NULL` rend la migration re-jouable au sein de sessions séparées. Dans une seule session, la transaction garantit l'atomicité.

### Validation post-migration

Script de smoke test (à exécuter post-migration) :

```sql
-- Sanity 1 : chaque trial a son variant_config_id renseigné.
SELECT COUNT(*) AS orphan_trials FROM trials WHERE variant_config_id IS NULL;
-- → 0 attendu

-- Sanity 2 : chaque variant_config_id existe bien dans variant_configs.
SELECT COUNT(*) AS broken_fk FROM trials t
LEFT JOIN variant_configs vc ON vc.id = t.variant_config_id
WHERE t.variant_config_id IS NOT NULL AND vc.id IS NULL;
-- → 0 attendu

-- Sanity 3 : chaque variant_configs.system_prompt_id existe bien dans system_prompts.
SELECT COUNT(*) AS broken_prompt_fk FROM variant_configs vc
LEFT JOIN system_prompts sp ON sp.id = vc.system_prompt_id
WHERE sp.id IS NULL;
-- → 0 attendu

-- Sanity 4 : nombre de configs uniques aujourd'hui = nombre de (provider, model_id, anthropicOpts) distincts.
SELECT COUNT(*) FROM variant_configs;
-- → exactement 6 attendu pour l'état actuel (4 OpenAI + 2 Anthropic, tous avec le même systemPrompt).
-- À adapter si le nombre de variants change dans eval.ts.

-- Sanity 5 : déduplication par content addressing — aucune paire de configs avec mêmes axes.
-- Si > 0, le content addressing ne tient pas (bug dans computeVariantConfigId ou dans canonicalize).
SELECT COUNT(*) AS bad_dedup FROM (
  SELECT provider, model_id, system_prompt_id, provider_options_json
  FROM variant_configs
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) > 1
);
-- → 0 attendu

-- Sanity 6 : équivalence backfill ↔ live (à exécuter en TS, pas en SQL pur).
-- Pour chaque variant currently defined in eval.ts :
--   computeVariantConfigIdForVariant(variant, currentSystemPrompt) doit retourner un id
--   qui existe déjà dans variant_configs (créé par le backfill historique).
-- Si un variant retourne un id absent → la canonicalization n'est PAS byte-équivalente
-- entre backfill et live → tous les nouveaux runs créeront des configs en doublon.
```

---

## 8. Découpage en commits

### Commit 1 — `feat(eval): variant configs + system prompts normalized tables`

Périmètre :
- **Schéma** (dans `SCHEMA_SQL` + helper `ensureVariantConfigIdColumn`) : tables `system_prompts`, `variant_configs`, colonne `trials.variant_config_id`, index.
- **Helpers** : `eval/storage/variant-config-id.ts` exporte `canonicalize`, `computeSystemPromptId`, `computeVariantConfigId`, `computeVariantConfigIdForVariant`, `buildProviderOptions`.
- **Migration data + drop** : `eval/storage/migrations/001-variant-configs.ts`, atomique en une transaction, invocable one-shot via `npx tsx ...`.
- Backfill des 17 runs existants.
- Drop des colonnes `runs.system_prompt_text` et `runs.system_prompt_sha256`.
- **Plumbing `runOne`** : remplace `anthropicJsonToolSettings` (eval.ts:37-43) par `buildProviderOptions(variant)`. Doit être **byte-équivalent** sur les variants Anthropic existants (cf. pre-flight check §10).
- **Plumbing runner** (runner-loop.ts) : pré-calcule `variantConfigId` par variant au début de `runEval`, `INSERT OR IGNORE` dans `system_prompts` + `variant_configs`, propage le `configId` dans chaque `TrialContext`.
- **Plumbing cache** : `TrialContext` (trial-cache.ts:7-16) gagne `variantConfigId`, `INSERT_SQL` (trial-cache.ts:55-67) gagne la colonne `variant_config_id`.
- **Discriminated union `EvalVariant`** (provider-tagged, avec `reasoningEffort?` côté OpenAI et `thinkingBudgetTokens?` côté Anthropic — déclarés mais non utilisés activement encore).
- **Suppression de `inferProvider`** : runner-loop.ts:106-110 et trial-cache.ts:34-38 ont chacun une copie de `inferProvider(modelId)`. Avec le discriminated union, `variant.provider` est explicite — `inferProvider` devient un fallback indéfendable (un model dont le préfixe ne match aucun pattern serait silencieusement classé "openai"). Supprimer les deux copies et passer `variant.provider` explicitement aux call sites :
  - runner-loop.ts:231 : `provider: job.variant.provider` (au lieu de `inferProvider(job.variant.modelId)`).
  - trial-cache.ts:109 : `args.context.provider` (déjà requis, on peut supprimer le `|| inferProvider(...)` defensive fallback).
- **Tests** :
  - `canonicalize` (ordre des clés, primitives, arrays, objets imbriqués).
  - `computeVariantConfigId` / `computeSystemPromptId` (déterminisme, sensibilité aux champs).
  - Migration idempotente (run twice, compare state).
  - **Equivalence backfill ↔ live** : pour chaque variant historique, `computeVariantConfigId` à la main = `computeVariantConfigIdForVariant` depuis le code current.
  - Sanity SQL post-migration.

Critère de réussite : run d'eval existant continue à passer, structure DB conforme aux sanity queries, **aucun cache miss inattendu** (cf. pre-flight check §10).

Note : `paramsSnapshotMiddleware` est **descopé** du commit 1 — voir §6, possible ajout futur comme validation post-call.

### Commit 2 — `feat(eval): reasoning effort axis on Opus 4.6/4.7 + reasoning column display`

Périmètre :
- Ajout de variants Anthropic avec `thinkingBudgetTokens` activé (cf. point ouvert §9.1).
- Adapter `console-output.ts` pour afficher une colonne "Reasoning" qui rend natif :
  - Variant OpenAI sans reasoningEffort → `—`
  - Variant OpenAI avec `reasoningEffort=high` → `effort=high`
  - Variant Anthropic sans thinking → `—`
  - Variant Anthropic avec `thinkingBudgetTokens=16384` → `budget=16k`
- Run de validation : premier run réel qui exerce les variants thinking, confirme que les cache hits/miss se passent correctement (la divergence de `paramsSha` doit forcer un nouveau call pour les variants avec thinking).

Critère de réussite : main table affiche correctement le reasoning par variant, les nouveaux variants thinking apparaissent et se comparent visuellement aux baselines.

---

## 9. Points encore ouverts

### 9.1 — Stratégie d'ajout des variants Opus thinking

**Différé au commit 2, sans engagement architectural.** Le schéma content-addressed permet d'ajouter, remplacer ou supprimer des variants dans `eval.ts` à volonté — `variant_configs` les déduplique automatiquement. La décision *"quels variants concrets je rajoute"* est un choix produit, pas un choix de design.

Options possibles au moment du commit 2 :
- **(a) Remplace** les variants `claude-opus-4-7` et `claude-opus-4-6` existants par leurs versions thinking → on perd la baseline de comparaison côté run live, mais l'historique reste auditable dans la DB.
- **(b) Ajoute** 2 nouveaux variants `claude-opus-4-7-thinking-high` et `claude-opus-4-6-thinking-high` à côté des existants → 8 variants, comparaison directe avec/sans thinking dans le même run.
- **(c) Ajoute** 4 variants : `*-thinking-low` + `*-thinking-high` pour Opus 4.6 et 4.7 → 10 rows, sweep complet sur le budget.

Recommandation par défaut : **(b)**. Budgets candidats : `low` = 2048, `medium` = 8192, `high` = 16384 (à valider avec la doc Anthropic avant prod).

### 9.2 — Forme exacte de la colonne "Reasoning" dans le main table

**Différée au commit 2.** On verra les données dans le terminal puis on tranchera. Trois pistes possibles :

- Une colonne unique `Reasoning` avec rendu provider-aware (`effort=high` / `budget=16k` / `—`).
- Deux colonnes `Effort` (OpenAI) et `Thinking` (Anthropic), une seule remplie par row.
- Colonne `Reasoning` opt-in via `--cols=reasoning` (cohérent avec le `--cols` existant).

---

## 10. Vérification post-implémentation (Definition of Done)

### Pour le commit 1

- [ ] **Pre-flight cache invariance check (À FAIRE EN PREMIER, avant tout autre changement)** : avant de remplacer `anthropicJsonToolSettings` (eval.ts:37-43) par `buildProviderOptions(variant)`, capturer le `static_hash` d'une trial Anthropic existante. Après le refactor, recalculer `static_hash` pour la même config et vérifier qu'il matche byte-à-byte. Procédure concrète :
  - (a) `sqlite3 eval-results/eval.db "SELECT static_hash, model_id FROM trials WHERE provider='anthropic' LIMIT 1"` → noter la valeur.
  - (b) Implémenter `buildProviderOptions` en remplacement local de `anthropicJsonToolSettings`.
  - (c) Lancer `npm run eval -- --trial-count=1 --case-slugs=dev-2642-python-nantes` avec `EVAL_LOG_STATIC_HASH=1` ou équivalent → vérifier que le `static_hash` calculé pour cette variant Anthropic matche celui en (a).
  - Si pas de match : ajuster `buildProviderOptions` (ordre des clés, présence d'un champ, etc.) jusqu'à équivalence byte-à-byte.
  - **Sans ce check, tous les trials Anthropic seront cache miss au 1er run post-migration → $$ dépensés en surprise.**
- [ ] `npx tsc --noEmit` ne reporte aucune nouvelle erreur dans `eval/` ou `core/search-engine/services/natural-language-filter.service.eval.ts`.
- [ ] `npm test` (vitest) passe, incluant les nouveaux tests sur `canonicalize`, `computeVariantConfigId`, équivalence backfill↔live, et migration idempotente.
- [ ] `npm run eval -- --trial-count=3 --case-slugs=dev-2642-python-nantes` (sur cache existant) reproduit les scores historiques à 100% (aucun cache miss, aucune divergence).
- [ ] Les 4 sanity SQL du §7 retournent les valeurs attendues.
- [ ] La DB n'a plus de colonnes `runs.system_prompt_text` ni `runs.system_prompt_sha256`.

### Pour le commit 2

- [ ] Run réel avec les nouveaux variants thinking, ratio Fresh ≈ 100% sur ces variants, 0% sur les anciens.
- [ ] **Sanity cache miss attendu** : ajouter `thinking.budget_tokens` dans `providerOptions` fait diverger `paramsSha` (key-builder.ts:49 hashe `providerOptions`), donc `staticHash` diverge → cache miss vs l'ancien variant sans thinking. Vérifier empiriquement : `Fresh` doit être 100% sur les nouveaux variants thinking au 1er run, $$ dépensés en conséquence. C'est attendu — ne pas confondre avec un bug du cache.
- [ ] Colonne "Reasoning" affichée correctement dans le main table.
- [ ] Cost et latency reportés cohérents avec ce qu'on attend du thinking (latency plus haute, cost plus haut).
- [ ] Audit query "show me all configs of run X" produit le bon résultat via JOIN system_prompts ↔ variant_configs ↔ trials.

---

## 11. Hors scope explicite

Ce qui **n'est PAS** dans cette spec, pour rester resserré :

- **Variation du systemPrompt par variant.** La machinerie est prête (variant_configs peut référencer n'importe quel system_prompt_id), mais aucun variant ne le déclenche aujourd'hui. À faire dans une PR séparée quand un V2 du prompt existera concrètement.
- **Variation de `temperature`, `topP`, etc.** Idem — la machinerie est prête (snapshot capture tout), mais aucun variant ne les override.
- **Versionning des SDK** (`ai_sdk_version`, `provider_sdk_versions_json` sur `runs`). YAGNI tant qu'aucun forensic query ne le demande. Ajouter si besoin réel.
- **Path A "éclater les helpers compound"** (la proposition initiale de splitting `requiresRole` en shape A/B/C). Pas de cible aujourd'hui — `requiresRole` est une disjonction sémantique, pas un compound AND. Garder ce pattern comme règle d'écriture pour les futurs cases (à documenter dans README §"Adding a case").

---

## 12. Historique

| Date | Auteur | Modification |
|---|---|---|
| 2026-05-11 | Design review (Nicolas + Claude) | Création de la spec, décisions D1-D9 actées, implémentation pas encore commencée. |
| 2026-05-11 | Review critique (Nicolas + Claude) | Fix C1 (plumbing variant_config_id explicite), C2 (calcul pré-call, descope snapshot middleware), C3 (pre-flight cache invariance check), I1 (séparation schema vs migration), I2 (transaction atomique). |
| 2026-05-11 | Review critique #2 (Nicolas + Claude) | Fix I3 (sanity dedup content-addressing + équivalence backfill↔live), I4 (`first_seen_at` déterministe via MIN(started_at) pour variant_configs), I5 (suppression `inferProvider`, `variant.provider` explicite). |
