# VAYRA Watch Room — rapport de qualification

**Date :** 14 juillet 2026 (UTC) · **Branche :** `main` · **Base :** `f601b314`
**Correctifs de ce lot :** `6ed008e`, `0da7b9d`, `87acecb`, `5a7f505`

## Verdict

> ## 🟠 BLOQUÉ pour la bêta élargie — audit et durcissement sûr : PASS
>
> Le lot d'audit et les corrections de stabilité **réalisables sans matériel** sont
> **complets et verts** (tsc, ESLint, 378 tests, build prod). La sortie en bêta élargie
> reste **bloquée** sur deux conditions que l'assistant ne peut pas lever seul.

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
| Modèle d'accès serveur (blocage/exclusion/expiration/archive, Collections v2) | ✅ sain à l'audit (null-safe, verrou unique, rotation topic) |
| Confidentialité du fil VEYA | ✅ propre (position seule) |
| Suite de tests / build | ✅ 378 passés (flake `local-transport` connu, hors périmètre) ; build 7,65 s |

## Conditions bloquantes avant bêta élargie

### Condition 1 — corriger deux défauts de sévérité bloquante restants
- **VEYA-B2** (garde même-média) : fix filaire prêt et documenté (audit §3). Exige une
  modification du protocole de sync → à appliquer **puis observer** sur deux appareils.
- **A11Y-2** (présence/statut des participants non annoncés) : `aria-live` + libellés +
  dock focusable.

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

## Majeurs non bloquants à traiter avant/pendant l'élargissement

VARA-2 (room morte listée), VEYA-N1 (vitesse hôte non appliquée), VEYA-N2 (trou d'autorité
au transfert), CAST-1/2, A11Y-3/5. Fixes documentés dans l'audit §2.2.

## En attente de ton accord explicite

- **PRIV-BUGREPORT** : durcir le payload de signalement (liste blanche + scrubbing) —
  changement de **protocole de confidentialité**, non touché sans ton feu vert.
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
