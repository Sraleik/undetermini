---
id: "0003"
title: "Les modèles vivent dans la config du projet, l'export ne la modifie jamais en place"
status: proposed
date: 2026-10-14
tags: ["models", "config"]
supersedes: []
superseded-by: null
related: []
---

# 0003 — Les modèles vivent dans la config du projet, l'export ne la modifie jamais en place

## Contexte

Ajouter un modèle à évaluer oblige à modifier la lib, la publier, puis
attendre que le projet récupère la version (une PR en septembre, la PR 5 en
octobre). SRA-945 fait déclarer les modèles par le projet. Il faut choisir
où vit la déclaration, sachant qu'une commande d'export doit l'écrire pour
les projets qui ont déjà un historique, et que `undetermini.config.ts` est
un fichier TypeScript écrit et modifié à la main.

## Décision

Les modèles se déclarent sous la clé `models` de `defineConfig`, dans
`undetermini.config.ts`. La commande `undetermini models export` ne modifie
jamais la config en place. Si la config existe, elle la copie d'abord en
`undetermini.config.old.ts`, puis écrit une config neuve : le texte de
l'ancienne, avec la clé `models` insérée dans l'objet passé à
`defineConfig`. Si elle ne trouve pas `defineConfig({`, ou si `models` y est
déjà, elle n'écrit rien, affiche le bloc à coller et sort en erreur. Sans
config, elle en écrit une neuve. Un projet qui déclare `models` est la seule
source : aucune fusion avec une liste de la lib. Au temps 2 (0.6.0), la lib
ne fournit plus aucun modèle au run.

## Options écartées

- Un fichier `undetermini.models.ts` séparé, importé par la config — un
  fichier de plus à tenir ; Nicolas préfère une seule config.
- Un fichier JSON — ni types ni commentaires (un prix d'intro se commente).
- Une édition en place de la config — fragile sur un fichier écrit à la
  main ; la copie `.old.ts` garde le filet en cas de pépin.
- Garder une copie de la liste de la lib pour l'export seul, après le
  temps 2 — c'est une liste lue en douce, que la spec exclut.

## Conséquences

- Bien : un modèle ajouté au projet apparaît dans la TUI et le CLI sans
  aucune publication de la lib.
- Bien : l'autocomplétion de `defineConfig` couvre les modèles.
- Mal : l'insertion repère `defineConfig({` dans le texte ; une config
  écrite autrement retombe sur le bloc à coller.
- Mal : au temps 2, l'export ne distingue plus « encore servi » de
  « retiré » ; le retrait se marque à la main.

## Confirmation

- Test : export sur une config existante, `undetermini.config.old.ts` est
  identique à l'octet à l'ancienne config.
- Test : config sans `defineConfig({` ou avec `models`, aucun fichier
  écrit, code de sortie non nul.
- Test : au temps 2, config sans `models`, erreur qui nomme
  `undetermini models export`, et 0 appel à `doGenerate`.
