# VAYRA Watch Room — rapport de qualification

**Date :** 14 juillet 2026 (UTC) · **Branche :** `main` · **Base :** `f601b314`
**Correctifs de ce lot :** `6ed008e`, `0da7b9d`, `87acecb`, `5a7f505`, `3cbd355`, `2025fb5`

## Verdict

> ## 🟡 PASS AVEC LIMITES — reste la seule observation sur appareils réels
>
> Tous les défauts de sévérité **bloquante** sont **corrigés** (dont VEYA-B2 et A11Y-2). Le
> code est vert (tsc, ESLint, **386 tests**, build prod). Il ne reste, avant de déclarer une
> plateforme validée, que **l'observation sur de vrais binaires et appareils** — un geste
> humain (deux comptes / deux appareils / cast), **prévu ultérieurement** par le responsable.
> Aucune plateforme ne peut être déclarée validée avant cette observation (INTERDIT respecté).

## Ce qui est PASS (fait et vérifié statiquement)

| Domaine | État |
| --- | --- |
| Audit end-to-end (seams, 6 dimensions + re-audit VEYA) | ✅ livré (`watch-room-audit.md`) |
| Matrice de recette attribuable plateforme | ✅ livrée (`watch-room-recette.md`) |
| Liste priorisée bloquants vs cosmétique | ✅ livrée (audit §2) |
| Fuites de confidentialité en logs (PRIV-1..4, scénario 10) | ✅ corrigées (`6ed008e`) |
| Boucle de reconnexion sur room disparue (VARA-1) | ✅ corrigée + tests (`0da7b9d`) |
| Tempête de seek au snapshot (VEYA-B1) | ✅ corrigée + test (`87acecb`) |
| Collections archivées en lecture seule (ACCESS-1) | ✅ corrigée (`5a7f505`) |
| Annonces lecteur d'écran lobby + erreurs (A11Y-1/4) | ✅ corrigées (`5a7f505`) |
| Garde même-média VEYA (VEYA-B2) | ✅ corrigée + 8 tests (`3cbd355`) |
| Présence/statut participants annoncés (A11Y-2) | ✅ corrigée (`2025fb5`) |
| Modèle d'accès serveur (blocage/exclusion/expiration/archive, Collections v2) | ✅ sain à l'audit (null-safe, verrou unique, rotation topic) |
| Confidentialité du fil VEYA | ✅ propre (position seule) |
| Suite de tests / build | ✅ 378 passés (flake `local-transport` connu, hors périmètre) ; build 7,65 s |

## Condition restante avant bêta élargie

### ~~Condition 1 — deux blocages restants~~ ✅ LEVÉE
VEYA-B2 (`3cbd355`) et A11Y-2 (`2025fb5`) sont corrigés et couverts par tests. Il ne reste
aucun défaut de sévérité bloquante non corrigé.

### Condition 2 — observation réelle (gate de la DÉFINITION DE DONE)
La DoD impose l'observation « sur de vrais binaires et appareils, pas seulement par tests ».
**Aucun scénario n'a été observé sur binaire réel** ici — je n'ai ni les deux comptes/deux
appareils, ni le récepteur cast, ni l'Android/ExoPlayer, et je ne crée pas de compte ni ne
saisis de mot de passe (contraintes de sécurité). Exécuter la **matrice de recette** en
entier ; en particulier les scénarios qui ne peuvent PASSER que par observation :

- **3-4** (play/pause/seek, arrivée tardive, reconnexion, transfert d'hôte) — 2 appareils.
- **5** (suspension VEYA sous cast, fenêtre de connexion cast — CAST-1) — récepteur réel.
- **6** (exclusion/blocage/révocation/expiration coupent l'accès immédiatement) — 2 comptes.
- **8** (mpv / html5 / exo / web) — un binaire par plateforme ; consigner les différences.
- **9** (clavier, lecteur d'écran, RTL, mobile) — outils d'accessibilité réels.

Tant que la recette n'est pas exécutée et consignée, **aucune plateforme ne peut être
déclarée validée** (ton propre INTERDIT).

## Majeurs non bloquants — corrigés

VARA-2 (`d6c81c0`), VEYA-N1 (`e8ed6e0`), VEYA-N2 + CAST-1 (`890e06d`), A11Y-3 + A11Y-5
(`c7457b0`), et PRIV-BUGREPORT (`3b2c3c2`, sur accord). Il reste **CAST-2** (bouton cast
gaté par le moteur) : **différence de plateforme connue**, non corrigée à l'aveugle car son
correctif propre exige une détection cast native + matériel de test — consignée, à trancher
avec observation.

## En attente de ton accord explicite

- **ARCHIVE-ROOM-GAP** : décision produit (évincer les rooms lancées avant archivage, ou
  accepter la limite bornée au TTL).

## Décisions produit ouvertes

- `together`/`useRoomSync` (legacy, diffuse `infoHash`) reste-t-il un chemin actif ? Sinon,
  clarifier « Watch Room = VEYA » et retirer/gouverner ce chemin séparément.
- `use-vara-room.ts` (démo locale) : à retirer si mort, pour lever la confusion d'audit.

## Ce que je n'ai PAS fait (et pourquoi)

- Aucune nouvelle fonctionnalité sociale/contenu ni nouvelle table (INTERDIT respecté).
- Aucun déploiement Supabase (aucune migration dans ce lot ; et je n'agis pas sur la
  production sans ton « déploie sur supabase »).
- Aucune modification du protocole de confidentialité (bug-report) sans ton accord.
- Aucune correction de sync à l'aveugle (VEYA-B2/N1/N2) : elles exigent l'observation que
  seul un humain peut mener ici.
