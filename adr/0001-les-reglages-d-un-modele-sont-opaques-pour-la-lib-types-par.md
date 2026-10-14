---
id: "0001"
title: "Les réglages d'un modèle sont opaques pour la lib, typés par le projet"
status: proposed
date: 2026-10-14
tags: ["models", "settings"]
supersedes: []
superseded-by: null
related: []
---

# 0001 — Les réglages d'un modèle sont opaques pour la lib, typés par le projet

## Contexte

Jusqu'à la 0.4.2, la lib tient une table de capacités par modèle
(`model-capabilities.ts`) et un vocabulaire fermé de réglages : effort de
raisonnement (`minimal` à `high`), budget de réflexion, réflexion adaptative.
Le moteur en déduit les axes à balayer, et branche sur le fournisseur pour
choisir lequel. Chaque évolution d'API côté fournisseur (une valeur d'effort
`xhigh`, un `minimal` qui part en `none` à partir de gpt-5.1, un réglage
propre à une route OpenRouter) impose de modifier la lib, de la publier,
puis d'attendre que les projets la récupèrent. SRA-945 retire le catalogue
de modèles de la lib ; un vocabulaire de réglages fermé y ferait revenir le
même problème par une autre porte. La spec de SRA-945 prévoyait ce
vocabulaire fermé ; Nicolas l'a abandonné à la phase de design.

## Décision

Un modèle déclaré par le projet porte des réglages nommés dont le contenu
est opaque pour la lib : `settings?: Record<string, TSetting>`, où `TSetting`
est un type que le projet définit. La lib fait le produit modèle × nom de
réglage × prompt × schéma, nomme la variante `<id>__<nom du réglage>`, et
transmet le réglage tel quel au sujet. Le sujet le traduit pour sa route
dans `buildProviderOptions`. Le moteur ne branche plus sur le fournisseur.

## Options écartées

- Vocabulaire fermé tenu par la lib (spec initiale) — chaque nouvelle valeur
  d'API coûte une version de la lib.
- Vocabulaire fermé avec les valeurs exactes de l'API (`none` ajouté) — même
  défaut, repoussé à la prochaine valeur.
- Garder `minimal` plus un drapeau de traduction dans la déclaration — le
  sujet doit alors recevoir la déclaration pour traduire, et le drapeau est
  encore un vocabulaire tenu par la lib.

## Conséquences

- Bien : une évolution d'API se règle dans le projet, et TypeScript signale
  chaque endroit à reprendre dans sa traduction.
- Bien : le moteur maigrit — plus de table de capacités, plus de branche par
  fournisseur, plus d'axes effort et budget dédiés.
- Bien : les noms de variantes et l'identité du cache restent stables, tant
  que les réglages gardent les noms `eff-<valeur>` / `think-<budget>` et que
  le sujet produit les mêmes options d'appel.
- Mal : la lib ne peut plus valider le contenu d'un réglage ; une faute de
  frappe dans un réglage ne se voit qu'au typecheck du projet, ou à l'appel.
- Mal : la TUI perd ses sections effort et budget au profit d'une section
  générique « réglages du modèle ».
- Mal : changement cassant du contrat des sujets (`EvalVariant` à forme
  unique, `provider` en chaîne libre), publié en 0.5.0.

## Confirmation

- `git grep "provider ===" packages/core` est vide.
- Un test canari fige le `variant_config_id` littéral de `gpt-5__eff-low`
  avant et après la migration.
- `model-capabilities.ts` n'existe plus dans `packages/core` à partir de la
  0.6.0.
