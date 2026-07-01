# NL Filter — budget tokens & densité de règles par version

> Suivi du coût par appel du `buildNlFilterSystemPrompt()`
> (`core/search-engine/services/natural-language-filter.service.ts`) et des prompts
> eval de `eval/prompts/`. Sert à arbitrer les itérations : **où partent les tokens**
> et **quand on entre en zone whack-a-mole**.
>
> Tokenizer : `o200k_base` (gpt-4.1). Méthode de (re)génération en bas du doc.

---

## 1. Prompt système + densité de règles (par version)

`systemPromptTokenCount` = tokens du `.md` rendu. `rules` = nb de bullets d'instruction
(`- ` / `* ` / `N.`) — proxy de la **densité de règles** (mêle règles contestées +
boilerplate, mais révèle nettement les inflexions).

| Version | systemPromptTokenCount | rules | industrie inline |
|---|---:|---:|:--:|
| v9-baseline | 10 032 | 174 | oui |
| **v10-baseline** | 8 560 | **179** | oui |
| v11-baseline | 7 312 | 142 | oui |
| v12-baseline | 6 927 | 142 | non (by-name) |
| **v13-baseline** (= prod actuel) | 8 137 | **181** | oui |
| v13-industry-byname-v1 | 7 752 | 181 | non (by-name) |
| v13-rank-cleanup-v1 | 8 150 | 181 | oui |
| v13-rank-explained-v1 | 8 245 | 184 | oui |
| **v14-baseline** (candidat promotion) | 7 721 | **182** | non (by-name) |
| v14-fix-bug-doublon-v1 | 7 337 | 174 | non (by-name) |
| v14-no-linkedin-degree-v1 | 7 336 | 175 | non (by-name) |
| **v15-baseline** (fusion fix-bug-doublon + no-linkedin) | 7 036 | **168** | non (by-name) |
| v15-audit-fix-v1 | 6 912 | 164 | non (by-name) |
| v15-audit-fix-v2 | 6 973 | 164 | non (by-name) |
| **v16-baseline** (= promotion byte-identique de v15-audit-fix-v2) | 6 973 | **164** | non (by-name) |
| v16-employer-trap-v1 (= v16 + règle COMPANY_NAME≠hirer) | 7 041 | 164 | non (by-name) |
| **v17-baseline** (= promotion byte-identique de v16-employer-trap-v1 — PROD) | 7 041 | **164** | non (by-name) |

> v9 → v17 (prompt système) : **10 032 → 7 041 tok (−30 %)**, **174 → 164 règles**.
> La règle anti-piège v17 enrichit le bullet COMPANY_NAME existant (+68 tok, 0 règle nouvelle).

## 2. Schéma `response_format` (par état du CODE, pas par prompt)

Le schéma (`nlExtractionSchema` → `Output.object`) est **injecté comme des tokens
d'input classiques** (coût + guidance via descriptions/enums) **et** appliqué par
décodage contraint (grammaire, `strict`). Il dépend de l'état du code, pas du fichier
prompt. `schemaTokenCount` = `zodToJsonSchema(nlExtractionSchema)` sérialisé puis tokenizé
(estimation ; la sérialisation exacte de l'AI SDK v6 peut différer de quelques %).

| État schéma | LANGUAGE | COMPANY_INDUSTRY | schemaTokenCount |
|---|---|---|---:|
| pré-PR #2333 | enum (167) | enum (533) | 6 572 |
| PR strict (sortie/MCP) | enum (167) | enum (147) | 4 587 |
| PR LLM-facing | **string** | enum (147) | **4 009** |
| **strict extraction 2026-06-12** (sans LANGUAGE_PROFICIENCY ni DURATION_IN_JOB) | string | enum (147) | **3 686** |
| **strict extraction + no LINKEDIN_RELATIONS_DEGREE** (divergence 3) | string | enum (147) | **3 436** |

Contributions variables : enum langue 167 = **578 tok** · enum industrie 533 = **2 536 tok** · enum industrie 147 = **551 tok**.

## 3. Somme prompt + schéma (bout-en-bout, par jalon)

| Jalon | prompt | schéma | **somme** |
|---|---:|---:|---:|
| v9-baseline (+ schéma pré-PR) | 10 032 | 6 572 | **16 604** |
| prod aujourd'hui (v13-baseline + schéma prod) | 8 137 | 4 009 | **12 146** |
| v13-by-name (+ schéma prod) | 7 752 | 4 009 | **11 761** |
| **v14-baseline (+ schéma strict 2026-06-12)** | 7 721 | 3 686 | **11 407** |
| **v14-no-linkedin-degree-v1 (+ schéma divergence 3)** | 7 336 | 3 436 | **10 772** |

**v9-baseline → v13-by-name : −4 843 tok/call (−29,2 %)** — dont −2 280 prompt (−22,7 %) et −2 563 schéma (−39,0 %).
Le gain *marginal* du by-name lui-même (prod → v13-by-name) n'est que **−385 tok** : le gros gain industrie (533→147) est **déjà capté côté schéma**, déjà en prod.

> Caveat coût : gpt-4.1 cache le préfixe statique (prompt+schéma quasi constants) → l'impact **coût** est plus faible que l'impact **count** ; les counts bruts ci-dessus, eux, sont exacts.

## 4. Leçon whack-a-mole (densité de règles, pas tokens)

Symptôme observé (v10) : chaque itération individuelle réparait bien la règle ajoutée,
mais **créait des régressions ailleurs**.

- **Le whack-a-mole suit le nombre de règles en interaction, PAS les tokens.** De v9→v10
  les tokens **baissent** (10 032 → 8 560) mais les règles **montent** (174 → 179) — et
  c'est là que ça régresse. Invisible dans un classement par tokens.
- Zone douloureuse empirique ici : **~175-180 bullets d'instruction** sur les mêmes
  décisions (KEYWORD vs INDUSTRY, isRequired, bundles…).
- **Remède qui a marché = consolidation, pas ajout** : v11 est passé 179 → **142 règles**
  (fusion/suppression de règles qui se marchaient dessus).
- ⚠️ **Flag** : la prod (v13) est à **181 bullets**, > v10 (179). Une partie est du
  boilerplate prod-only (bundles, output format, traduction) absent des prompts eval —
  mais à surveiller : avant d'ajouter une règle, vérifier qu'elle ne ré-ouvre pas le whack-a-mole.
- Rappel : on est à ~12k tok sur un contexte gpt-4.1 de ~1M → **jamais un problème de
  limite dure**, toujours un problème d'**interférence d'instructions**.

---

## Régénérer ces chiffres

```bash
# prompt tokens + rules (par .md)
bun -e '
import { getEncoding } from "js-tiktoken";
const enc = getEncoding("o200k_base"); const NL = String.fromCharCode(10);
for (const f of ["v9-baseline","v10-baseline","v11-baseline","v12-baseline","v13-baseline","v13-industry-byname-v1"]) {
  const t = await Bun.file("eval/prompts/"+f+".md").text();
  const rules = t.split(NL).filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\./.test(l)).length;
  console.log(enc.encode(t).length, "tok", rules, "rules", f);
}'

# schéma response_format (état courant du code)
bun -e '
import { getEncoding } from "js-tiktoken";
import { zodToJsonSchema } from "zod-to-json-schema";
import { nlExtractionSchema } from "./core/search-engine/services/natural-language-filter.service.ts";
const enc = getEncoding("o200k_base");
console.log(enc.encode(JSON.stringify(zodToJsonSchema(nlExtractionSchema))).length, "schema tok");'
```

> MAJ à chaque nouvelle baseline. Dernière MAJ : 2026-06-12 (v16 + schéma strict divergence 3).
