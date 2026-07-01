# NL Filter — System Prompt : améliorations potentielles (backlog)

> Notes d'améliorations **non appliquées** au `buildNlFilterSystemPrompt()`
> (`core/search-engine/services/natural-language-filter.service.ts`). À traiter
> plus tard. Chaque item est étayé par une vérif ES staging (`search-talent-20260309`,
> ~12.5M docs, via la skill Elasticsearch / `A_TALENT_SEARCH_QUERY`).

---

## #1 — Expliquer KEYWORD vs COMPANY_INDUSTRY au modèle (priorité haute)

### Le constat (vérifié ES, 2026-05-29)

`KEYWORD` et `COMPANY_INDUSTRY` ne sont pas deux variantes du même truc — ce sont
**deux natures de champ ES différentes**, et le modèle confond les deux.

| | KEYWORD (`keywords`) | COMPANY_INDUSTRY (`job_company_industries`) |
|---|---|---|
| Type ES | texte libre / full-text (analysé) | catégoriel exact (`term`, lowercase) |
| Vocabulaire | **ouvert** (n'importe quelle string) | **fermé** (taxonomie LinkedIn figée) |
| Match si… | le terme apparaît **n'importe où** dans le texte de LA PERSONNE | la **boîte ACTUELLE** de la personne est taguée dans CE secteur exact |
| Décrit | une compétence / fonction / domaine de la personne | le **secteur de l'employeur courant** |
| Périmètre temporel | tout le profil texte | **entreprise actuelle uniquement** (le passé est dans le nested `experience[].industry`, NON requêté par ce filtre) |

### Preuves ES (counts)

```
KEYWORD  "sports"                → 481 182   |  INDUSTRY "sports"               → 53 517   (même mot, ×9)
KEYWORD  "finance d'entreprise"  →  63 141   |  INDUSTRY "finance d'entreprise" →      0   (fonction ≠ secteur)
KEYWORD  "contrôle de gestion"   → 168 003   |  INDUSTRY "contrôle de gestion"  →      0
```

→ Une **fonction/compétence/domaine** (contrôle de gestion, finance d'entreprise,
Excel, OPEX) renvoie **0 en industry** : ça ne vit qu'en KEYWORD.
→ Un **secteur** (sport, entertainment, banque, santé, retail) vit en
COMPANY_INDUSTRY — mais voir #2 (vocabulaire fermé).

### Règle proposée à ajouter au prompt (brouillon)

> **Choisir KEYWORD vs COMPANY_INDUSTRY :**
> - Si le critère décrit le **secteur d'activité de l'entreprise** (sport,
>   divertissement, banque, santé, retail…) → `COMPANY_INDUSTRY`. ⚠️ la valeur
>   doit être une valeur **exacte** de la taxonomie (sinon 0 résultat). Ce filtre
>   ne regarde que l'**employeur actuel** du candidat.
> - Si le critère décrit une **compétence, une fonction, un métier, un domaine
>   ou une techno** (contrôle de gestion, finance d'entreprise, FP&A, Excel,
>   OPEX…) → `KEYWORD`. Vocabulaire libre, cherché dans tout le texte du profil.
> - Dans le doute (le terme n'est pas clairement un secteur d'entreprise) →
>   `KEYWORD`.

### Gotcha "entreprise actuelle seulement" → garder industry SOFT

`COMPANY_INDUSTRY` ne matche que la boîte **actuelle**. Un profil "auditeur en
transition vers la finance" est encore **chez son cabinet d'audit**
(secteur `accounting`/`professional services`), pas encore dans le secteur cible.
Donc un `COMPANY_INDUSTRY = sport/entertainment` **required** exclurait pile les
profils "en transition" qu'on cherche. → cet industry doit rester `isRequired:false`
(boost de ranking), jamais un gate. À documenter dans le prompt.

---

## #2 — Pruner l'enum COMPANY_INDUSTRY sur la taxonomie ES réelle (parké)

L'enum `INDUSTRY_VALUES` (`core/search-engine/search-talents-filter.schema.ts:159`)
propose la taxonomie LinkedIn-v2 granulaire, mais l'index ES utilise l'**ancienne
taxonomie courte**. Résultat : le modèle émet des valeurs **mortes (0 profil)**.

```
term job_company_industries  →  sports 53 517 · entertainment 29 233 · consumer services 31 298 · sporting goods 18 323
                                 spectator sports 0 · professional services 0 · services for the elderly and disabled 0 (émis 13/30 !)
```

**TODO** : extraire la liste distincte réelle des `job_company_industries` de ES
(l'action `A_TALENT_SEARCH_QUERY` strippe les `aggregations` → passer par un script
direct), puis (a) pruner l'enum du prompt sur cette liste, (b) ajouter une assertion
eval "toute COMPANY_INDUSTRY ∈ taxonomie ES réelle".

---

## #3 — Anti-leak "valeur exacte" sur KEYWORD intensité (lié au scorer)

Le modèle garde les qualificatifs d'intensité (`Excel avancé` 2.9K vs `Excel` 1.2M,
×425). Ajouter une règle : retirer `avancé / expert / maîtrise` des keywords de
compétence (garder le terme nu). Déjà capté côté eval par l'assertion `9364671f`.

---

_Source des chiffres : sessions de diagnostic 2026-05-29 sur le case
`marseille-controleur-auditeur-radius50`. Voir aussi `eval/PRICING.md` et les
mémoires projet `project_company_industry_enum_desync_es`,
`project_eval_blind_spot_filter_json_not_results`._
