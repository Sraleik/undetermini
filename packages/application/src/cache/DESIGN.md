# `eval/cache/` — Design doc

> Status : **draft, à valider avant code**
> Author : conversation Nicolas × Claude, 2026-05-07
> Scope : étape 1 du chantier cache (rate limit + budget guard reportés)

---

## 1. Contexte / problème

Le cache d'evalite est inadapté à notre usage :

- Sa clé inclut `trialCount` mais **pas `trialIndex`** (`node_modules/evalite/dist/cache.js:7-17`).
- Conséquence 1 : tous les K trials d'un même run partagent la même clé → trial 0 fait l'appel, trials 1..K-1 hit la cache, **K outputs identiques** → variance artificielle à 0.
- Conséquence 2 : changer `trialCount` invalide tout le cache cross-run (30 cached + bump à 50 ⇒ clé différente ⇒ 1 appel, pas 20).

D'où l'override `EVAL_CACHE=true ⇒ trialCount=1` actuel : on évite de mentir sur la variance, mais on perd l'amortissement cross-run.

**Insight déclencheur** (Nicolas, 2026-05-07) : evalite est juste un *orchestrateur + persisteur SQLite*. Sa logique de cache, son score, son UI — on n'en consomme rien (le JSON exporté est notre source de vérité). On peut donc remplacer son cache par le nôtre **sans patcher evalite davantage**, en interceptant les appels LLM en amont via le wrapper `model`.

## 2. Objectif

Un cache **trial-aware, additif, persistant cross-run**. Cible :

- 30 trials cached, demande de 50 ⇒ 30 hits + **20 nouveaux appels** (pas 1, pas 50)
- Demande à 50 ensuite ⇒ 50 hits, $0
- Bump à 100 ⇒ 50 hits + 50 misses
- Variance préservée : trial *i* a son propre output, distinct du trial *j*

## 3. Non-objectifs (étape 1)

Volontairement hors-scope, à reprendre après :

- **Rate limiting** (token bucket par provider, backoff sur 429)
- **Budget guard** (refus de démarrer si coût estimé > seuil)
- **GC automatique** des anciennes entrées (`rm -rf` manuel pour l'instant)
- **Cache cross-machine / partagé équipe** (S3, etc.) — local FS only
- **Compression / dedup** des entrées identiques
- **Rescore standalone** (re-runner les scorers sur des outputs LLM déjà persistés sans
  refaire les appels). Outil séparé, à designer dans son propre doc — pas un mode de ce
  cache. Cf §13 (versioning des assertions) qui prépare le terrain.

## 4. Architecture

### 4.1 Couches

On compose **2 wrappers AI SDK** au lieu de réinventer la roue :

```ts
const rawModel = openai('gpt-4.1');

// Couche interne : notre cache trial-aware via AI SDK middleware (API publique stable)
const cachedModel = wrapLanguageModel({
  model: rawModel,
  middleware: trialCacheMiddleware({ slug, mode, getNextTrialIndex }),
});

// Couche externe : tracing evalite intact (tokens → SQLite → export-run.ts)
const finalModel = wrapAISDKModel(cachedModel, { caching: false });
```

Flow d'un appel :

```
evalite.task(input, variant)
   │
   ▼
service.convertPromptToFilters(input)        ← code métier inchangé
   │
   ▼
finalModel.generateText(...)                 ← stack à 2 niveaux ci-dessus
   │
   ├─▶ wrapAISDKModel (extérieur)            ← capture latence, tokens
   │     │
   │     ▼
   │   wrapLanguageModel + trialCacheMiddleware (intérieur)
   │     │
   │     ├─▶ [1] cache.lookup(key)  →  HIT ?  → return cached    (0 token)
   │     │           │ MISS
   │     │           ▼
   │     ├─▶ [2] rawModel.doGenerate(...)    ← vrai appel LLM
   │     │           │
   │     │           ▼
   │     └─▶ [3] cache.write(key, response)
   │
   ▼
SQLite evals.output peuplé (avec metadata tokens, latence)
```

**Pourquoi cette stack** :
- `wrapAISDKModel` (extérieur) capture le tracing pour evalite. On ne le réimplémente pas.
- Sur cache hit, le middleware retourne la réponse cachée → wrapAISDKModel la trace
  comme un appel "0 token" (même comportement qu'avec le cache evalite aujourd'hui).
- Sur cache miss, le middleware passe au model → tracing normal en sortie.
- `caching: false` sur wrapAISDKModel : on désactive le cache evalite pour ne pas avoir
  2 caches qui se marchent dessus. Le patch `patches/evalite+1.0.0-beta.16.patch` reste
  utile (sans lui, `caching: false` est ignoré upstream).

Ordre `cache → real call` important : un cache hit ne consomme pas de slot rate-limit (cf chantier futur).

### 4.2 Composition de la clé

```ts
type CacheKey = {
  modelId: string;            // "gpt-4.1", "claude-opus-4-7"
  systemPromptSha: string;    // sha256 du system prompt complet
  schemaSha: string;          // sha256 du schéma Zod de structured output
  paramsSha: string;          // sha256 des autres params (temp, top_p, …)
  promptSha: string;          // sha256 du user prompt (= case input)
  trialIndex: number;         // 0..N-1
};
```

**Règle :** tout ce qui peut faire varier l'output doit être dans la clé. Si un attribut bouge, le cache devient invalide automatiquement (souhaité).

### 4.3 Layout filesystem

Ordre **case en haut, config en bas** — reflète la fréquence réelle de changement
(le user prompt d'un case est gelé une fois écrit ; le system prompt / modèle / schéma
itèrent en boucle pendant le dev).

```
eval-results/cache/
└── <promptSha>/                    ← un dossier par case (stable, gelé)
    ├── <staticHash-A>/             ← config A : gpt-4.1 + system prompt v1
    │   ├── 0.json
    │   ├── 1.json
    │   └── …
    ├── <staticHash-B>/             ← config B : gpt-4.1 + system prompt v2 (tu as itéré)
    │   └── …
    └── <staticHash-C>/             ← config C : claude-opus-4-7 + system prompt v2
        └── …
```

| Tu fais | Effet |
|---|---|
| Tu modifies le system prompt | nouveau `<staticHash>` sous chaque case lancé → l'ancien reste pour A/B |
| Tu changes de modèle | idem, nouveau `<staticHash>` |
| Tu modifies le user prompt d'un case | nouveau `<promptSha>` au top → ancien obsolète, drop manuel |
| Tu compares "cette case sur 3 configs" | `ls cache/<promptSha>/` → 3 sous-dossiers, scriptable |
| Tu nukes une config sur tous les cases | itération sur tous les `<promptSha>/` (pattern moins fréquent — on assume) |

Pourquoi pas l'inverse (config en haut, case en bas) :
- Le pattern dominant en dev est *"j'itère sur cette case avec différentes configs"*, pas
  *"je rejoue cette config sur tous les cases"*. La hiérarchie suit le pattern dominant.
- Un user prompt change rarement (rédigé une fois) ; un system prompt / modèle change
  souvent (loop d'optimisation). On veut que le moins-mouvant soit en haut.

Avantage vs un layout flat (`<fullHash>-<i>.json`) : on peut inspecter "toutes les configs
essayées sur cette case" en `ls` simple.

### 4.4 Format de fichier

```jsonc
{
  "key": {
    "modelId": "gpt-4.1",
    "trialIndex": 5,
    "promptSha": "sha256:...",
    "systemPromptSha": "sha256:...",
    "schemaSha": "sha256:...",
    "paramsSha": "sha256:..."
  },
  "metadata": {
    "createdAt": "2026-05-07T14:23:42Z",
    "latencyMs": 1234,
    "tokens": { "input": 1234, "output": 567 },
    "estimatedCostUsd": 0.0123,
    "evaliteVersion": "1.0.0-beta.16"
  },
  "response": { /* full AI SDK GenerateTextResult, sérialisé */ }
}
```

`metadata` n'influence pas la clé — c'est purement audit. La feuille du cache est self-contained : si on déplace le fichier, on peut le rebrancher (la clé est dans le contenu).

## 5. Trial index — comment le récupérer

Décision : **Option 2 (compteur en mémoire) en runtime, Option 1 (ALS evalite) en cross-check dev**.

### 5.1 Compteur

```ts
const counter = new Map<string, number>();   // key = `${slug}::${modelId}`
const mutexes = new Map<string, Mutex>();

const getNextTrialIndex = async (slug: string, modelId: string): Promise<number> => {
  const k = `${slug}::${modelId}`;
  const mutex = mutexes.get(k) ?? new Mutex();
  mutexes.set(k, mutex);
  return mutex.runExclusive(() => {
    const next = counter.get(k) ?? 0;
    counter.set(k, next + 1);
    return next;
  });
};
```

Robuste à evalite changeant son interne. Atomique avec `maxConcurrency=5`.

### 5.2 Cross-check (dev only)

Si `EVAL_DEBUG_TRIAL_INDEX=true`, lire `evalite/cache.cacheContextLocalStorage` (ou son équivalent ALS pour traceContext) et logger un warn si `counterIndex !== alsIndex`. Pas de fallback runtime — c'est juste un assert dev.

À spike avant de coder : confirmer que l'ALS expose bien `trialIndex` à l'endroit où `task()` s'exécute.

## 6. Modes

Variable d'env : `EVAL_CACHE_MODE=<mode>`. Renomme `EVAL_CACHE` (introduit au commit
précédent, peu d'usage déployé — rename direct, pas d'alias rétro-compat).

**Deux modes seulement.** Volontairement minimal — chaque mode supplémentaire doit
gagner sa place avec un cas d'usage concret.

| Mode | Read | Write | Quand l'utiliser |
|---|:-:|:-:|---|
| `auto` *(défaut)* | ✓ | ✓ | Toujours. Hit si fichier existe, sinon vrai appel + write. |
| `refresh` | ✗ | ✓ (overwrite) | "Le cache est foiré / suspect, regénère tout depuis zéro." |

**Modes envisagés et drop** :
- `off` (no read, no write) — cas d'usage marginal ("je veux pas polluer le cache pour
  ce run expérimental"). Si le besoin se confirme, on rajoute. Pour l'instant : `rm -rf`
  manuel après le run fait l'affaire.
- `replay` (read-only, throw on miss) — la vraie demande derrière n'était pas un mode du
  cache mais un outil séparé : *"re-runner les scorers sur des outputs LLM persistés
  sans repayer les appels"*. C'est un script `bun eval/rescore.ts` (cf §13), pas une
  variante de ce cache.

Le mode `auto` rend obsolète le hack `EVAL_CACHE=true ⇒ trialCount=1`. Le cache trial-aware permet enfin `cache:on + multi-trial` sans collapser la variance.

## 7. Concurrence & atomicité

- evalite scheduler tourne `maxConcurrency=5` trials en parallèle (mêmes ou différents cases).
- **Risque 1 — race sur le compteur** : 2 trials concurrents demandent l'index suivant pour la même `(slug, modelId)`. Mutigé par le mutex en 5.1.
- **Risque 2 — race sur l'écriture** : 2 misses concurrents pour le même `<trialIndex>.json` ne devrait pas arriver puisque le compteur garantit unique. Mais en cas de bug : `writeFileSync` non-atomique. Mitigation : write en `<trialIndex>.json.tmp` puis `rename` atomique.
- **Risque 3 — corruption** : process killé pendant write. Le `.tmp + rename` couvre ça aussi (le fichier final n'existe que si le write a fini).

## 8. Invalidation

### 8.1 Automatique (souhaité)

| Changement | Effet sur la clé | Cache vu comme |
|---|---|---|
| User prompt édité | `promptSha` change | nouveau dossier `<promptSha>` — ancien sur disque, inutilisé |
| System prompt édité | `systemPromptSha` change | nouveau `<staticHash>` |
| Schéma Zod modifié | `schemaSha` change | nouveau `<staticHash>` |
| Modèle changé (`gpt-4.1` → `4.1-mini`) | `modelId` change | nouveau `<staticHash>` |
| Temperature, etc. modifiés | `paramsSha` change | nouveau `<staticHash>` |

### 8.2 Manuelle

```bash
rm -rf eval-results/cache/                                    # tout
rm -rf eval-results/cache/<staticHash>/                       # une config (modèle + prompt + schéma)
rm -rf eval-results/cache/<staticHash>/<promptSha>/           # un case sur une config
rm eval-results/cache/<staticHash>/<promptSha>/5.json         # un trial précis
```

### 8.3 Pas géré

- Pas de TTL (un trial reste valide tant qu'on ne change rien dans la clé)
- Pas d'invalidation sur version evalite ou AI SDK (assumé : les outputs LLM ne changent pas si on bump une lib hors-prompt)

## 9. Tests

| Test | But |
|---|---|
| `trial-counter.test.ts` — incrément séquentiel | sanity |
| `trial-counter.test.ts` — 100 incréments concurrents → `[0..99]` distincts | atomicité du mutex |
| `cache.test.ts` — write + read round-trip | format + sérialisation |
| `cache.test.ts` — mode `replay` sur miss → throw | comportement strict |
| `cache.test.ts` — mode `refresh` overwrite | sémantique correcte |
| `cache.test.ts` — clé change si systemPromptSha change | invalidation auto |
| Integration — mock LLM, run 5 trials, verify 5 fichiers cache, bump à 8, verify 3 nouveaux appels | end-to-end |

Pas de test sur evalite lui-même — on assume son comportement (sinon faut juste mocker l'ALS).

## 10. Migration

- Le wrapper actuel `wrapAISDKModel(rawModel, { caching: cachingEnabled })` disparaît.
- Remplacé par `trialCachedModel(rawModel, { slug, mode })` dans `*.service.eval.ts`.
- L'env `EVAL_CACHE` (true/false) → renommée en `EVAL_CACHE_MODE` (auto/off/refresh/replay). On peut garder un alias 1 sprint pour ne pas casser des scripts manuels qui auraient `EVAL_CACHE=true`.
- Le patch evalite (`patches/evalite+1.0.0-beta.16.patch`) qui force `caching:false` à fonctionner devient inutile dans notre code (on n'utilise plus `wrapAISDKModel`). On peut le garder le temps d'être sûr, ou le drop.

## 11. Open questions à trancher avant de coder

1. **`paramsSha` — quels params on hash exactement ?** Toute la `RequestParams` AI SDK ou
   un subset ? Probablement tout ce qui n'est pas le prompt — à valider en lisant le type.
2. **Format réponse cachée — sérialiser comment ?** Le `GenerateTextResult` de AI SDK
   contient potentiellement des objets non-trivialement sérialisables (ReadableStream
   pour streaming). On cible structured output (pas de streaming), donc en principe
   simple. À valider en lisant le type retour du middleware AI SDK.

**Résolues par l'approche middleware AI SDK** :
- ~~Tracing evalite~~ : on garde `wrapAISDKModel` en couche externe, le tracing continue
  comme aujourd'hui (cf §4.1). Pas de réimplem.
- ~~Drop du patch evalite caching:false~~ : on le **garde**. Il sert maintenant à empêcher
  evalite de sur-cacher par-dessus notre cache (au lieu de juste désactiver son cache).

## 12. À faire (plan d'implémentation)

1. Spike : confirmer points (1) et (2) ci-dessus en lisant le type
   `LanguageModelV2Middleware` d'AI SDK et le retour de `doGenerate`.
2. Implem `trial-counter.ts` + tests (incrément séquentiel + atomicité concurrente).
3. Implem `trial-cache.ts` (lookup, write atomique via `.tmp + rename`, modes `auto`/`refresh`) + tests.
4. Implem `trial-cache-middleware.ts` (AI SDK `LanguageModelV2Middleware`, compose les 2)
   + integration test.
5. Câbler dans `natural-language-filter.service.eval.ts` :
   - Stack `wrapLanguageModel({ middleware: trialCacheMiddleware(...) })` à l'intérieur
   - `wrapAISDKModel(..., { caching: false })` à l'extérieur
   - Supprimer `EVAL_CACHE`, ajouter `EVAL_CACHE_MODE` (auto/refresh)
   - Drop le hack `cachingEnabled ⇒ trialCount=1` (plus nécessaire)
6. Smoke test : `EVAL_TRIAL_COUNT=5` deux fois de suite ⇒ 1er run = 5 calls, 2e run = 0
   calls. Bump à 8 ⇒ 3 calls.
7. Update `eval/README.md` (la section "Caching gotcha" disparaît, remplacée par la doc
   cache trial-aware).

## 13. Versioning des assertions (préparation rescore)

Posé par Nicolas pendant la review du design. **Pas implémenté dans cette PR cache** —
mais le contrat doit être posé maintenant pour que le rescore (chantier suivant) puisse
s'appuyer dessus.

### 13.1 Pourquoi versioner

Les assertions par case ne seront pas justes du premier coup. En itérant, on va modifier
`assertions[]` plusieurs fois. Quand on rescore un ancien run avec une nouvelle version
des assertions, on veut savoir clairement *quelle version a produit quel score*.

### 13.2 Deux niveaux de versioning, déjà à moitié là

| Niveau | Source | Déjà dispo ? | Sert à |
|---|---|---|---|
| **Audit exact** | `git.sha` dans le run JSON | ✅ oui (cf `export-run.ts`) | `git checkout <sha>` pour reproduire bit-pour-bit |
| **Audit humain** | `assertionsVersion: <int>` par case | ❌ à ajouter | "v3 vs v1 : pass rate 80% → 60%, voici les cases qui ont régressé" |

### 13.3 Format proposé

Champ entier dans chaque case file, à bumper manuellement :

```ts
export default defineCase({
  id: '92f527a7-...',
  slug: 'dev-2642-python-nantes',
  assertionsVersion: 1,                  // ← NOUVEAU. Bump quand assertions[] change.
  assertions: [...]
});
```

**Règle de bump** :
- Bumper si tu modifies/ajoutes/retires une assertion du case → `1 → 2`
- Pas besoin de bumper si tu touches `helpers.ts` (les helpers sont versionnés
  implicitement par git.sha)

### 13.4 Exposition dans l'export JSON

Ajout d'un champ `assertionsVersion` dans chaque case du payload exporté :

```jsonc
"variants": [{
  "name": "gpt-4.1",
  "cases": [{
    "caseSlug": "dev-2642-python-nantes",
    "caseId": "92f527a7-...",
    "assertionsVersion": 2,              // ← captured
    "aggregate": {...},
    "trials": [...]
  }]
}]
```

→ Un futur outil rescore peut lire l'ancien export (`assertionsVersion: 1`), relancer les
scorers actuels (qui sont peut-être à `assertionsVersion: 2`), et exposer le diff
proprement.

### 13.5 Pas auto-versionnant par hash

Tentation : hasher le source de la fonction `check` pour bumper auto. Refusé :
- Whitespace/comments → faux positifs
- Helpers partagés → modifier `requiresRole` impacterait toutes les cases qui l'utilisent
- Manque de contrôle : un bump manuel fait acte de "j'ai validé ce changement"

Le couple `(git.sha, assertionsVersion)` couvre tout l'audit nécessaire.
