---
id: "0002"
title: "Les prix se déclarent par périodes, en chaînes, et se calculent avec dinero.js"
status: accepted
date: 2026-10-14
tags: ["models", "pricing"]
supersedes: []
superseded-by: null
related: []
---

# 0002 — Les prix se déclarent par périodes, en chaînes, et se calculent avec dinero.js

## Contexte

Jusqu'à la 0.4.2, un prix est un triplet de flottants (`input`, `output`,
`cachedInput`, en USD par million de tokens) par identifiant de modèle, sans
date. Trois forces s'opposent à cette forme. Les tarifs changent dans le
temps : Sonnet 5 avait un prix d'intro jusqu'au 2026-08-31, et la table n'a
pu en garder qu'un. Les flottants dérivent : 1 000 essais de 1 200 tokens à
0,075 $/M totalisent `0.09000000000000193` au lieu de `0.09` (mesuré avec
bun). Le cache rejoue des essais anciens au tarif du jour, et un run
recalcule donc un coût qui n'a jamais été payé.

## Décision

Un modèle déclare `price` comme une liste de périodes `{ from, input,
output, cachedInput }` : chaque période court de `from` jusqu'à la suivante,
et une liste vide veut dire « prix inconnu ». Les montants sont des chaînes
décimales en USD par million de tokens, recopiées de la page du
fournisseur. La lib les convertit au chargement en montants `dinero.js` (v2)
et ne calcule qu'avec eux. Le coût d'un essai est le prix en vigueur à la
date de son appel, rejeu compris. Il s'enregistre en entier, en
nano-dollars (`cost_nano_usd`). Le flottant n'apparaît qu'à l'affichage.

## Options écartées

- Un prix unique par modèle — perd les tarifs d'intro et les changements de
  tarif, et oblige à éditer la déclaration le jour du changement.
- Des nombres dans la déclaration — TypeScript les lit en flottants avant
  même que la lib ne les voie.
- Un parseur décimal et une arithmétique entière écrits à la main — c'est
  le code qu'on écrit seul et qui casse sur le cas qu'on n'a pas vu.
- big.js ou decimal.js — robustes, mais génériques : la devise et l'arrondi
  monétaire restent à notre charge. dinero.js est fait pour l'argent, et sa
  v2 est stable (2.0.2).

## Conséquences

- Bien : les totaux sont exacts, et un tarif futur se déclare d'avance.
- Bien : un essai rejoué coûte ce qu'il a vraiment coûté ; un prix déclaré
  après coup s'applique aux essais lancés sans prix.
- Mal : une dépendance de plus dans une lib publiée.
- Mal : deux colonnes de coût cohabitent en base — `estimated_cost_usd`
  (REAL, l'historique, jamais réécrit) et `cost_nano_usd` (INTEGER, les
  essais neufs). La lecture convertit l'ancienne une fois, à la frontière.

## Confirmation

- Test : 1 000 essais de 1 200 tokens à `'0.075'` totalisent exactement
  90 000 000 nano-dollars.
- Test : avec une période d'intro au 2026-07-01 et une standard au
  2026-09-01, un essai appelé le 2026-08-15 coûte le tarif d'intro, y
  compris rejoué en octobre.
- Test : un prix `'0,075'` est refusé au chargement, avec le modèle nommé.
