# Interactive Variant Builder & Picker — Design (Draft v2)

> Statut : **draft v2, à valider avant implémentation.** Cette spec capture le design retenu après l'itération du 2026-05-11.
>
> **v1 (commit `d7ca0377b`)** proposait un flow "build variants one-by-one" — abandonné parce que le mental model d'expérimentation n'est pas *"je construis 8 variants à la main"* mais *"je balaie ces valeurs sur ces dimensions"*.
>
> **v2 (cette spec)** pivote sur deux idées :
> 1. **Sélection par axes** plutôt que par variants ; le cartésien produit les variants.
> 2. **Double entry point** — TUI interactive (Nicolas) et CLI scriptable (Claude/cloud worker) partagent le même core pur.
>
> Lire `eval/VARIANT-AXES-DESIGN.md` en complément pour comprendre l'état du framework côté data model et storage.

---

## 1. Contexte et motivation

### Le besoin

Aujourd'hui pour tester un nouveau variant (par exemple un sysPrompt V2), il faut :

1. Éditer `core/search-engine/services/natural-language-filter.service.eval.ts`.
2. Y ajouter une entrée dans `openAiVariants[]` ou `anthropicVariants[]`.
3. Lancer `npm run eval -- --variants=...` (filtrage par nom).
4. Si on veut tester N variations, on commit/uncommit N fois ou on garde des branches dirty.

C'est lent et invasif pour des expériences exploratoires (typiquement : *"est-ce qu'un wording différent du sysPrompt améliore la métrique X ?"*).

### Ce qu'on veut

**Pour Nicolas (TUI)** : naviguer interactivement à travers les axes, voir un recap, décocher les combos inutiles, lancer.

**Pour Claude / un worker scheduled (CLI)** : passer tous les axes en flags, runs direct, scriptable, reproductible.

Les deux ne sont **pas en compétition** — ils sont deux façades de la même logique. La TUI est meilleure pour l'exploration humaine, la CLI est meilleure pour l'orchestration programmatique.

### Le principe directeur

Le système **n'invente aucun nouveau modèle de données** — il assemble dynamiquement des objets qui matchent l'`EvalVariant` discriminated union existante. Un variant produit par cartésien est byte-équivalent (au niveau du `variant_config_id` hash) à un variant qu'on définirait statiquement.

`prepareVariantConfigs` (`eval/storage/variant-config-id.ts:33-86`) est déjà idempotent et content-addressed → un variant produit par cartésien insert sa config dans `variant_configs` exactement comme un variant statique. **Aucun changement DB.**

---

## 2. État du framework au moment d'écrire cette spec

| Acquis | Référence | Conséquence pour le design |
|---|---|---|
| `EvalVariant` est un discriminated union par `provider`, avec axes optionnels (`reasoningEffort`, `thinkingBudgetTokens`, `systemPrompt`) | `core/search-engine/services/natural-language-filter.service.eval.ts:64-90` | Le cartésien construit des objets matchant cette union. |
| `prepareVariantConfigs` accepte tout `V extends { name, provider, modelId, systemPrompt? }` et persiste `system_prompts` + `variant_configs` content-addressed | `eval/storage/variant-config-id.ts:33-86` | Aucun changement framework. Le cartésien push juste les variants dans `subject.variants` avant `runEval`. |
| `runOne` utilise `variant.systemPrompt ?? defaultSystemPrompt` | `core/search-engine/services/natural-language-filter.service.eval.ts:145-185` | SysPrompt override déjà plomé. |
| `variant_configs.id = sha256(provider, modelId, systemPromptId, providerOptionsJson)` — content-addressed, `variant.name` n'y apparaît PAS | `eval/storage/variant-config-id.ts:22-33,68-93` | Display name et id sont déjà séparés au niveau code. |
| Le cache hashe le sysPrompt effectif via `paramsSha` | `eval/cache/key-builder.ts:33,49,52` | Pas de pollution croisée : un nouveau prompt ne réutilise jamais le cache d'un ancien. |
| CLI args parsing actuel : `--case-slugs`, `--trial-count`, `--cache-mode`, `--max-concurrency`, `--sections`, `--cols`, `--sort` | `eval/cli-args.ts` (`parseEvalArgs`) | Le nouveau mode s'ajoute via 4 flags d'axis + 1 flag `--interactive`, sans casser l'existant. |
| **Le sysPrompt actuel est déjà composé de 9 paragraphes nommés** joints par `\n\n` (`role, task, filterTypes, bundles, adHocBundleExpansion, historySemantics, booleanSemantics, rules, translation`) | `core/search-engine/services/natural-language-filter.service.ts:187-346` | Mais cette compositionnalité **reste interne à `NlService`** — le framework eval ne la voit pas. Voir §8. |

**Découverte importante** (à corriger en passant) :

- Aucun des 4 models OpenAI actuellement déclarés (`gpt-4o-mini`, `gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4.1`) ne supporte `reasoning_effort`. Cet axis est mort sur ces modèles. Pour le tester, il faudra ajouter un model `gpt-5*` ou `o-series`.
- `claude-opus-4-7` **rejette** `thinking.budget_tokens` (adaptive thinking only) → bug latent dans le type actuel qui autorise le combo. Voir §7.

---

## 3. Architecture — module core partagé + 2 façades

### Layout

```
eval/
├── axes/                          ← NOUVEAU : module pur, partagé TUI + CLI
│   ├── axis-inputs.ts             ← type AxisInputs (les valeurs collectées par chaque axis)
│   ├── model-capabilities.ts      ← capability matrix par modelId (§7)
│   ├── expand-cartesian.ts        ← (AxisInputs, subject) → EvalVariant[] avec skip invalid
│   └── variant-name.ts            ← auto-nom selon convention §6
├── interactive/                   ← NOUVEAU : façade TUI (Nicolas)
│   ├── runner.ts                  ← orchestre les étapes (§4)
│   └── prompts/                   ← un fichier par étape, testable
│       ├── select-cases.ts
│       ├── select-models.ts
│       ├── select-axis-values.ts
│       └── confirm-run.ts
├── prompts/                       ← NOUVEAU : stockage sysPrompts (§8)
│   ├── default.ts                 ← export `defaultSystemPrompt` (réf à NlService)
│   └── *.md                       ← prompts opaques user-créés
└── cli-args.ts                    ← étendu : parse les 4 flags d'axis (§5)
```

### Core pur : `expandCartesian`

```ts
// eval/axes/axis-inputs.ts
export type AxisInputs = {
  models: string[];                        // modelIds sélectionnés
  reasoningEfforts: ReadonlyArray<EffortValue | 'default'>;
  thinkingBudgets: ReadonlyArray<number | 'default'>;
  sysPrompts: ReadonlyArray<{ name: string; text: string } | 'default'>;
};

// eval/axes/expand-cartesian.ts
export const expandCartesian = (
  axes: AxisInputs,
  subject: EvalSubject,
): EvalVariant[] => {
  // 1. Produit cartésien des 4 axes
  // 2. Pour chaque combo, vérifie compat via model-capabilities
  // 3. Si invalide → skip silencieusement
  // 4. Si valide → construit l'EvalVariant correspondant
  // 5. Auto-nom via variant-name.ts
};
```

`expandCartesian` est **pur** : input → output, pas d'effet de bord, testable unitairement (mock subject, asserts sur output). C'est le seul endroit où vit la logique métier "axes → variants".

### Les deux façades

- **TUI** (`eval/interactive/runner.ts`) collecte `AxisInputs` via prompts interactifs (§4), puis appelle `expandCartesian(axes, subject)`.
- **CLI** (`eval/cli-args.ts` + `eval/runner.ts`) parse les flags en `AxisInputs`, puis appelle `expandCartesian(axes, subject)`.

Les deux finissent par appeler `runEval(subject, ...)` (déjà existant) avec `subject.variants` remplacé par le résultat du cartésien.

### Modes d'invocation

| Mode | Comportement |
|---|---|
| `npm run eval` (sans flag d'axis) | Flow actuel : tous les `subject.variants` × tous les `subject.cases`. **Backward-compat 100%.** |
| `npm run eval --models=... --reasoning-efforts=...` | **CLI pur** : cartésien des axes fournis, run direct, aucun prompt. |
| `npm run eval --interactive` (ou `-i`) | **TUI pur** : prompts pour tout, ignore tout flag d'axis. |
| `npm run eval -i --models=gpt-5-mini` | **Hybride** : TUI pré-rempli avec les flags fournis, prompts pour le reste. |

---

## 4. Façade TUI — flow interactif (Nicolas)

Déclenché par `--interactive` ou `-i`. Quatre étapes séquentielles.

### Étape 1 — Sélection des cases

```
? Cases to run · (multi-select, all checked by default)
  ☒ dev-2642-python-nantes
      "peut tu me donner des dev python avec 5ans d'exp sur nantes ?"
  ☒ dev-fullstack-react-node-lyon
      "devs fullstack React + Node 3-5 ans Lyon"
```

- Toutes cochées par défaut.
- Affiche le slug + preview de l'input.
- Validation : `>= 1` case sélectionné.

### Étape 2 — Sélection des 4 axes

Les 4 axes sont indépendants. Multi-select sur chacun. Les options de chaque axis sont peuplées dynamiquement (depuis `subject.variants`, `model-capabilities.ts`, `eval/prompts/`).

```
? Models (multi-select)
  ☒ gpt-4o-mini       (openai)
  ☒ gpt-4.1-nano      (openai)
  ☒ gpt-4.1-mini      (openai)
  ☒ gpt-4.1           (openai)
  ☐ gpt-5-mini        (openai)         ← models additionnels visibles
  ☐ claude-opus-4-7   (anthropic)
  ☒ claude-opus-4-6   (anthropic)

? Reasoning effort (multi-select — ignoré sur models non-reasoning)
  ☒ (default / unset)
  ☐ minimal
  ☐ low
  ☐ medium
  ☐ high

? Thinking budget tokens (multi-select — ignoré sur models openai et opus-4-7)
  ☒ (default / unset)
  ☐ 4096
  ☐ 8192
  ☐ 16384

? System prompts (multi-select)
  ☒ default
  ☐ v2-strict          ← eval/prompts/v2-strict.md
  ☐ no-bundles         ← eval/prompts/no-bundles.md
  ☐ [+ new via $EDITOR]
```

Choisir `[+ new via $EDITOR]` :
1. Demande un nom (`? Name for this prompt · my-experiment`).
2. Ouvre `$EDITOR` (vim/nano/code) sur un tmpfile pré-rempli avec le baseline assemblé (string opaque).
3. À save+exit, copie le contenu vers `eval/prompts/<name>.md`.
4. Si le contenu est byte-identique au baseline : ne crée pas le fichier, traite comme `default`.
5. Retourne au prompt avec la nouvelle option pré-cochée.

### Étape 3 — Recap décochable

Le cartésien est calculé. Combos provider-incompatibles silent-skippés. La liste des variants restants est présentée en multi-select tous pré-cochés.

```
? Variants to run (multi-select — décochez les indésirables) ·
  ☒ gpt-4.1-mini
  ☒ gpt-4.1-mini__sys-v2-strict
  ☒ gpt-5-mini
  ☒ gpt-5-mini__eff-low
  ☒ gpt-5-mini__eff-medium
  ☒ gpt-5-mini__eff-low__sys-v2-strict
  ☒ gpt-5-mini__eff-medium__sys-v2-strict
  ☒ claude-opus-4-6
  ☒ claude-opus-4-6__think-8192
  ☒ claude-opus-4-6__sys-v2-strict
  ☒ claude-opus-4-6__think-8192__sys-v2-strict

Total: 11 variants × 2 cases × 30 trials = 660 trials
  ↳ cache hits estimés: ~480 / 660
  ↳ fresh calls estimés: ~180
  ↳ coût estimé fresh: ≈ $0.85 (basé sur moyennes historiques tokens)
```

Cette étape résout le cas où le cartésien produit un combo qu'on veut pas (e.g. `gpt-5-mini__eff-high` mais pas `gpt-5-mini__eff-low`) — on décoche ce qu'on veut pas.

### Étape 4 — Confirm & run

```
? Trial count · 30                  ← pré-rempli depuis --trial-count si fourni
? Cache mode · auto                 ← pré-rempli depuis --cache-mode si fourni

? Proceed? · (Yes / No, cancel)
```

- Cancel = exit 0, aucun call fait.
- Yes = `runEval(subject, ...)` standard avec les variants assemblés.

---

## 5. Façade CLI — flow scriptable (Claude / worker)

### Flags d'axis

```bash
npm run eval -- \
  --case-slugs=dev-2642-python-nantes,dev-fullstack-react-node-lyon \
  --models=gpt-5-mini,claude-opus-4-6 \
  --reasoning-efforts=low,medium,high \
  --thinking-budgets=4096,8192 \
  --sys-prompts=default,v2-strict,./custom-prompt.md \
  --trial-count=30
```

| Flag | Type | Sémantique |
|---|---|---|
| `--models` | CSV de modelIds | Modèles à inclure. Doivent être déclarés dans `subject.variants` OU passer comme custom modelId valide. |
| `--reasoning-efforts` | CSV de `minimal\|low\|medium\|high\|xhigh\|default` | Valeurs d'effort à inclure. `default` = unset (omis du body). |
| `--thinking-budgets` | CSV d'entiers + `default` | Budgets thinking à inclure. `default` = unset. |
| `--sys-prompts` | CSV de noms (fichier dans `eval/prompts/`) ou paths relatifs | `default` = baseline. Autres = résolus en `eval/prompts/<name>.md` ou path direct. |

### Comportement

- Si **aucun** flag d'axis fourni : flow actuel preservé (tous les `subject.variants`). **Backward-compat 100%.**
- Si **au moins un** flag d'axis fourni : mode cartésien activé. Les axes non spécifiés défaultent à `[default]`.
- Combos invalides (capability matrix) : silent-droppés.
- Pas de recap décochable en CLI — le user construit son input précisément. Si besoin d'exclure un combo précis, lancer 2 commands séparées.

### Cas d'usage cibles

- **Claude orchestre un sweep** : compose une command avec les axes voulus, lance, analyse les résultats sortis dans la DB / console.
- **Cloud worker scheduled** (futur `F_KALENT_NIGHTLY_EVAL_SWEEP`) : invoque la même command via cron, push les résultats quelque part.
- **Reproduire une expérience de TUI** : à la fin du run TUI, on log la command CLI équivalente pour copier-coller (cf §11.2).

---

## 6. Naming convention & identity

### Display name (lisible, sortable)

Auto-généré selon convention déterministe :

```
<model>[__<provider-tuning>][__<sys>]
```

Avec :
1. **`<model>`** — toujours présent (e.g. `gpt-5-mini`, `claude-opus-4-6`).
2. **`__<provider-tuning>`** — si non-default. Mutuellement exclusif par provider :
   - OpenAI → `__eff-{minimal,low,medium,high,xhigh}`
   - Anthropic → `__think-{N}` où N = budget_tokens
3. **`__<sys>`** — si sysPrompt non-baseline → `__sys-<filename-sans-extension>`

Séparateur **`__`** (double underscore) pour disambiguer des `-` présents dans les modelIds.

Exemples :

```
gpt-5-mini                                    ← baseline pure
gpt-5-mini__eff-high                          ← effort non-default
gpt-5-mini__sys-v2-strict                     ← sysPrompt non-baseline
gpt-5-mini__eff-high__sys-v2-strict           ← 2 axes non-default
claude-opus-4-6__think-8192
claude-opus-4-6__think-8192__sys-no-bundles
```

### Identity (`variant_configs.id`, content-addressed)

Le display name **n'est pas l'id**. L'id est `sha256({provider, modelId, systemPromptId, providerOptionsJson})` — calculé par `computeVariantConfigId` (`eval/storage/variant-config-id.ts:22-33`). `variant.name` n'apparaît ni dans le hash ni dans la table `variant_configs`.

Conséquences :

| Action | Display name | configId | Cache |
|---|---|---|---|
| Rename `v2-strict.md` → `v2-tighter.md` | change | **stable** | hit ✓ |
| Édit le contenu de `v2-strict.md` | stable | **change** | miss (attendu) |
| Deux `.md` différents au contenu byte-identique | 2 noms distincts | **même id** | partagent cache |
| Re-construire le même variant demain | nouveau nom possible | **même id** | hit ✓ |

**Convention v1** : si tu édites le contenu d'un sysPrompt `.md`, **renomme le fichier**. Sinon tu peux te retrouver dans une table avec deux lignes `gpt-5-mini__sys-v2-strict` qui pointent vers deux configs différentes — visuellement identiques, sémantiquement non. Si on se brûle, on passe à un suffixe content-hash court (`__sys-v2-strict-a3f7`).

---

## 7. Capability matrix

`eval/axes/model-capabilities.ts` (nouveau fichier) déclare pour chaque modelId les axes qu'il supporte.

```ts
export type ModelCapability =
  | { reasoningEffort: ReadonlyArray<EffortValue> }
  | { thinking: 'budget' | 'adaptive' };

export const MODEL_CAPABILITIES: Record<string, ModelCapability[]> = {
  // OpenAI — non-reasoning
  'gpt-4o-mini':       [],
  'gpt-4.1':           [],
  'gpt-4.1-mini':      [],
  'gpt-4.1-nano':      [],
  // OpenAI — reasoning
  'gpt-5':             [{ reasoningEffort: ['minimal','low','medium','high','xhigh'] }],
  'gpt-5-mini':        [{ reasoningEffort: ['minimal','low','medium','high','xhigh'] }],
  'gpt-5-nano':        [{ reasoningEffort: ['minimal','low','medium','high','xhigh'] }],
  'o4-mini':           [{ reasoningEffort: ['low','medium','high'] }],
  // Anthropic — adaptive only (rejette budget_tokens)
  'claude-opus-4-7':   [{ thinking: 'adaptive' }],
  // Anthropic — budget_tokens supporté
  'claude-opus-4-6':   [{ thinking: 'budget' }],
  'claude-sonnet-4-6': [{ thinking: 'budget' }],
  'claude-haiku-4-5':  [{ thinking: 'budget' }],
};
```

Sources vérifiées 2026-05-11 :
- OpenAI : `reasoning_effort` supporté sur reasoning models seulement (gpt-5*, o1, o3, o4-mini). [docs](https://developers.openai.com/api/docs/guides/reasoning)
- Anthropic : `budget_tokens` rejeté sur Claude Opus 4.7 (adaptive thinking only). [docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)

`expandCartesian` consulte cette map et :
- Skip silencieusement les combos `(model openai non-reasoning, effort non-default)`.
- Skip les combos `(opus-4-7, thinking-budget non-default)`.
- Skip les combos `(model openai, thinking-budget non-default)` et `(model anthropic, effort non-default)` — cross-provider trivialement invalides.

À re-vérifier mensuellement avec les release notes des providers (idem `eval/PRICING.md`).

---

## 8. Storage des system prompts

Le framework eval traite les sysPrompts comme des **strings opaques** : 1 fichier = 1 hash = 1 valeur d'axis. **Aucune décomposition** côté eval ; comment `NlService` construit sa baseline reste son détail d'implémentation (les 9 blocs internes de `buildNlFilterSystemPrompt` existent toujours, juste invisibles au framework eval).

### Layout

```
eval/prompts/
├── default.ts          ← re-exporte `buildNlFilterSystemPrompt()` côté NlService
└── *.md                ← sysPrompts user-créés (strings complètes, format texte plat)
```

### Résolution

| Source | Comment c'est lu |
|---|---|
| TUI `[+ new via $EDITOR]` | $EDITOR pré-rempli avec `buildNlFilterSystemPrompt()` assemblé en string. Save → écrit dans `eval/prompts/<name>.md`. |
| TUI sélection d'un `.md` existant | Lit le fichier, passe le contenu comme `variant.systemPrompt`. |
| CLI `--sys-prompts=default` | Résout en `defaultSystemPrompt` (laisse `variant.systemPrompt` undefined → `runOne` fallback sur `defaultSystemPrompt`). |
| CLI `--sys-prompts=v2-strict` | Résout en `eval/prompts/v2-strict.md`. |
| CLI `--sys-prompts=./custom.md` | Path direct, résolu en relatif au cwd. |

Si l'user veut composer un prompt à partir de paragraphes existants (e.g. copier le `role` du baseline + changer le `task`), il le fait **manuellement dans son éditeur** lors de la création. Le framework ne propose pas d'API de composition — c'est volontaire pour éviter d'introduire de la complexité dans `eval/`.

---

## 9. Définition du done

- [ ] Module pur `eval/axes/*` créé, fonction `expandCartesian` testable unitairement (input fixé → output fixé).
- [ ] Capability matrix `eval/axes/model-capabilities.ts` populée avec OpenAI + Anthropic models actuels et nouveaux (gpt-5*, o4-mini).
- [ ] Flags CLI ajoutés à `eval/cli-args.ts` : `--models`, `--reasoning-efforts`, `--thinking-budgets`, `--sys-prompts`, `--interactive` (+ alias `-i`).
- [ ] Branchement dans `eval/runner.ts` : si aucun flag d'axis et pas `-i` → flow actuel (backward-compat) ; sinon route vers cartésien (façade CLI) ou TUI.
- [ ] Façade TUI `eval/interactive/runner.ts` : 4 étapes du §4, multi-select cases (>=1), multi-select axes, recap décochable, confirm.
- [ ] $EDITOR integration pour création de sysPrompts à la volée — pré-remplissage avec baseline, save vers `eval/prompts/<name>.md`, dedup byte-identique.
- [ ] Auto-naming `variant-name.ts` selon §6 — testé unitairement (cas baseline pure, 1 axis, 2 axes, 3 axes).
- [ ] Recap TUI affiche : count exact, cache hits/miss estimés, coût estimé fresh calls (basé `pricing.ts:computeCost` + moyennes historiques `trials.tokens_*`).
- [ ] Tous les flags CLI existants (`--trial-count`, `--cache-mode`, `--max-concurrency`, `--sections`, `--cols`, `--sort`) servent de defaults pour les prompts TUI pertinents.
- [ ] Cancel à n'importe quelle étape TUI = exit 0, aucun call fait, aucun write DB.
- [ ] Confirm TUI = délègue à `runEval` actuel, output console identique au flow non-interactif.
- [ ] Tests :
  - Unitaires sur `expandCartesian` (cartésien + skip invalides).
  - Unitaires sur `variant-name` (toutes les combinaisons d'axes).
  - Unitaires sur chaque prompt TUI (mocker inputs, vérifier outputs).
  - Intégration : un run end-to-end simulé (cases × variants × 1 trial) avec cache préchargé.
- [ ] Le code respecte les conventions existantes (TypeScript strict, pas de `any` ajouté).

---

## 10. Hors scope explicite

- **Persistance d'une session TUI** (`--save-as=experiment-N` pour rejouer). YAGNI : la CLI couvre la scriptabilité.
- **Mode "tweak existing variant"** : YAGNI — un variant en TUI peut être recréé byte-identique grâce au content-addressing (§6).
- **Sélection par regex/pattern** sur les noms (`--variants=opus-.*`). Le multi-select TUI + les flags CSV CLI couvrent.
- **Comparaison automatique post-run** (auto-affichage du diff baseline vs nouveau variant). Sortie console actuelle suffit en première itération.
- **TUI persistant en background** (dashboard live). Autre projet.
- **Variant deletion en session** : YAGNI — recap décochable couvre le cas "j'en veux pas".
- **API de composition de sysPrompts** (composer plusieurs blocs ensemble côté eval). Voir §8 — décision actée : eval ne connaît rien de l'intérieur du prompt.
- **Per-block axis sur le sysPrompt** (un axis indépendant par paragraphe `role`, `task`, etc.). Conséquence directe de la décision précédente — pas implémentable sans décomposer le prompt côté eval.

---

## 11. Points encore ouverts

À trancher dans la prochaine session ou pendant l'implém.

### 11.1 — Lib TUI

`@inquirer/prompts` recommandé (modulaire, import-on-demand, maintenu par Inquirer team). À valider : footprint réel, semver-respect, cross-platform.

Alternatives : `enquirer` (moins actif), `ink` (overkill pour pickers simples).

### 11.2 — Log de la command CLI équivalente à la fin d'un run TUI

À la fin d'un run TUI, afficher la command CLI qui produirait le même run :

```
✓ Run completed. To reproduce:
  npm run eval -- \
    --case-slugs=dev-2642-python-nantes,dev-fullstack-react-node-lyon \
    --models=gpt-5-mini,claude-opus-4-6 \
    --reasoning-efforts=default,low,medium \
    --sys-prompts=default,v2-strict \
    --trial-count=30
```

Utile pour copier-coller dans un script ou un commit message. Quasi-gratuit à implémenter — la TUI a déjà toutes les infos sous la main.

### 11.3 — Comportement de $EDITOR

- Fallback si `$EDITOR` non défini : `vi` (POSIX universel) ou erreur explicite *"set $EDITOR first"* ?
- Pré-remplir le tmpfile avec le baseline assemblé pour édition incrémentale. **Décidé** : oui, pré-remplir.
- Save+exit sans modif : traiter comme "no override" (utilise le default). **Décidé** : oui, check byte-equal et skip si identique.

### 11.4 — Estimation de coût dans le recap TUI

Trois options :
- (a) Ne pas estimer (juste compter trials fresh attendus).
- (b) Utiliser moyennes historiques tokens par modelId (lookup dans `trials`).
- (c) Demander à l'user un tokens-moyen.

**Reco : (b) si possible** (`SELECT AVG(tokens_input), AVG(tokens_output) FROM trials WHERE model_id = ? AND status = 'success'`), fallback (a) si aucune donnée historique.

### 11.5 — Format du flag `--sys-prompts`

Résolution actuelle : `default` (mot magique) | `<name>` (cherche `eval/prompts/<name>.md`) | `./path/to.md` (path direct).

Question : si un fichier s'appelle `default.md`, conflit avec le mot magique ? Reco : interdire la création d'un fichier `eval/prompts/default.md` (réservé).

### 11.6 — Promotion d'un sysPrompt expérimental vers `subject.variants`

Quand tu crées un variant en TUI/CLI et qu'il est prometteur, comment le promouvoir vers une définition statique dans `eval.ts` ?

**Reco** : afficher à la fin du run un snippet TS prêt à coller, sans automatiser le commit. L'user décide.

---

## 12. Découpage potentiel en commits

Pour info, si on implémente après validation de la spec :

1. **Commit 1 — `feat(eval): axes core module + capability matrix`**
   - `eval/axes/axis-inputs.ts`, `model-capabilities.ts`, `expand-cartesian.ts`, `variant-name.ts`.
   - Tests unitaires complets sur ces modules purs.
   - Aucun branchement encore dans `runner.ts` — code dormant.

2. **Commit 2 — `feat(eval): CLI cartesian mode`**
   - Flags `--models`, `--reasoning-efforts`, `--thinking-budgets`, `--sys-prompts` dans `cli-args.ts`.
   - Branchement dans `runner.ts` : si flag d'axis présent → cartésien.
   - Backward-compat preserved : aucun flag = flow actuel.
   - Tests d'intégration : run CLI cartesian avec cache préchargé.

3. **Commit 3 — `feat(eval): interactive TUI`**
   - `eval/interactive/runner.ts` + prompts.
   - Flag `--interactive`/`-i`.
   - $EDITOR integration, recap décochable.
   - Tests unitaires sur les prompts.

4. **Commit 4 — `feat(eval): TUI cost estimation + reproduction snippet`**
   - §11.2 (log CLI équivalente) + §11.4 (cost estimation).
   - Polish UX.

Chaque commit indépendamment shippable. Commit 1 + 2 suffisent à débloquer **Claude/cloud worker** sans la TUI. Commit 3 ajoute Nicolas. Commit 4 polish.

---

## 13. Historique

| Date | Auteur | Modification |
|---|---|---|
| 2026-05-11 | Conv design Nicolas + Claude (Cortana) | **v1** — Création initiale, approche "build variants one-by-one". |
| 2026-05-11 | Conv design itération | **v2** — Pivot vers axes + cartésien. Dual entry point CLI/TUI. Capability matrix. SysPrompt opaque. Display name ≠ id. Convention rename v1. |
