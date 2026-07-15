# VAYRA Watch Room — matrice de recette manuelle

**But :** recette reproductible et **attribuable à une plateforme**, couvrant la
DÉFINITION DE DONE (scénarios 1-10). À exécuter sur **deux comptes bêta, deux appareils
ou instances distinctes**. Chaque ligne est PASS / FAIL / BLOQUÉ / N/A avec preuve
(capture, log local sans fuite, horodatage).

## Prérequis

- Deux comptes bêta avec le flag `cira_beta` (voir guide d'exploitation).
- Appareils/instances : au moins un **desktop** (mpv **ou** html5 selon build) et un second
  appareil (desktop, web ou **Android/ExoPlayer**). Pour le scénario cast : un récepteur
  Chromecast/AirPlay réel.
- Réseau contrôlable (couper/rétablir le Wi-Fi ou basculer avion).
- Aucun DevTools requis pour piloter ; garder la console **visible** uniquement pour vérifier
  l'absence de fuites (scénario 10).

## Colonnes plateforme

`mpv` = desktop Tauri moteur mpv · `html5` = desktop/web moteur HTML5 · `exo` = Android
ExoPlayer · `web` = navigateur. Différences connues attendues (ne pas promettre l'uniformité) :
cast activable seulement sur **mpv** (CAST-2) ; seek exo = aller-retour natif ~500 ms.

---

## A. Socle CIRA → collection → VARA (scénarios 1-2)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Compte 1 et 2 se connectent (bêta) | Accès accordé, profil chargé | | | | |
| A2 | C1 envoie une relation CIRA à C2 ; C2 accepte | Relation active des deux côtés | | | | |
| A3 | C1 crée un groupe, y ajoute C2 | C2 voit le groupe | | | | |
| A4 | C1 crée une collection (policy *reader*), ajoute un item | Item visible ; C2 lecture seule | | | | |
| A5 | C1 « Démarrer une VARA » depuis la collection | Room créée, C1 hôte | | | | |
| A6 | C1 invite C2 dans la room ; C2 accepte | C2 rejoint, roster à jour | | | | |

## B. Synchronisation VEYA (scénarios 3-4)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Hôte lance la lecture | Invité démarre en < 2 s, pastille « VEYA » | | | | |
| B2 | Hôte **pause** | Invité se met en pause (fenêtre anti-loop 370 ms) | | | | |
| B3 | Hôte **seek avant** (+120 s) | Invité seek à la cible (hard drift), une seule fois | | | | |
| B4 | Hôte **seek arrière** (−90 s) | Idem, pas de tempête de seek | | | | |
| B5 | Invité **seek** localement | Se propage à la room (contrôle symétrique — VEYA-N3) | | | | |
| B6 | **Arrivée tardive** : C3 rejoint en cours | C3 se cale via snapshot ; **C1/C2 ne bougent PAS** (VEYA-B1 corrigé) | | | | |
| B7 | Hôte passe en **2×** | Les invités adoptent la vitesse 2× et convergent, sans seek-storm (VEYA-N1 corrigé) | | | | |
| B8 | **Bascule de média** : un invité ouvre un autre titre en restant dans la room | L'invité n'est **plus** happé sur le mauvais contenu (VEYA-B2 corrigé) ; un invité sur le même contenu synchronise toujours | | | | |
| B9 | **Transfert d'hôte** : l'hôte quitte, un invité revendique | Nouvel hôte ; le heartbeat reprend depuis la nouvelle autorité sans attendre le rafraîchissement provider (VEYA-N2 corrigé) | | | | |

## C. Réseau & résilience (scénario 4)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Couper le réseau d'un invité 20 s puis rétablir | Reconnexion, **appartenance conservée**, resync | | | | |
| C2 | Reconnexions répétées (flapping) d'un invité | Pas de stutter room-wide chez les autres (VEYA-B1 corrigé) | | | | |
| C3 | Activer une room **TTL-expirée** depuis la liste | Pas de boucle « joining » infinie ; teardown propre (VARA-1 corrigé) | | | | |
| C4 | Laisser une room expirer pendant l'affichage de la liste | La room morte disparaît de la liste à l'expiration (VARA-2 corrigé) | | | | |

## D. Cast (scénario 5)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Bouton cast présent ? | Oui sur **mpv** ; non sur html5/exo (CAST-2, différence connue) | | N/A | N/A | |
| D2 | Activer le cast en cours de VEYA | VEYA **suspendu**, cast/player sans régression (steady-state OK) | | N/A | N/A | |
| D3 | Fenêtre de connexion cast (juste après le tap) | VEYA + room-sync suspendus pendant la connexion (castEngagedRef), le bridge local n'est plus piloté (CAST-1 corrigé) | | N/A | N/A | |
| D4 | Arrêt du cast | Retour au player local ; vérifier reprise lecture (risque `stopCast` pause) | | N/A | N/A | |

## E. Contrôle d'accès (scénarios 6-7)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | C1 **exclut** C2 de la room | C2 perd l'accès **immédiatement** (topic tourné, RLS) | | | | |
| E2 | C1 **bloque** C2 (CIRA) | Éviction de toutes les rooms partagées + invites croisées supprimées | | | | |
| E3 | **Révocation** d'un lien de room | Lien inutilisable ensuite | | | | |
| E4 | **Expiration** d'invitation | Invitation non acceptable après TTL | | | | |
| E5 | **Archiver** le groupe | Collections en **lecture seule** : Edit/Delete/Add/Move/Remove absents (ACCESS-1 corrigé) ; « Démarrer une VARA » désactivé | | | | |
| E6 | Restaurer le groupe | Actions réapparaissent | | | | |
| E7 | Room VARA lancée **avant** archivage | La room du groupe est **fermée** à l'archivage (clients → VARA_ROOM_UNAVAILABLE, teardown propre) ; une room hors-groupe reste ouverte (ARCHIVE-ROOM-GAP corrigé) | | | | |

## F. Collections v2 : policy & délégation (scénario 7)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Policy *contributor* | Membre ajoute et gère **ses** items seulement | | | | |
| F2 | Policy *collaborator* | Membre édite **tout** item | | | | |
| F3 | Créer directement en *collaborator* | Un seul appel, policy correcte (v2 atomique) | | | | |
| F4 | Déléguer une collection à un membre | Le délégué gère cette collection ; pas de re-délégation, pas de non-membre | | | | |
| F5 | Retrait de délégation / sortie du membre | Droits coupés côté serveur **et** UI (trigger de purge) | | | | |

## G. Accessibilité & états (scénario 9)

| # | Étape | Attendu | mpv | html5 | exo | web |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | **Clavier seul** : créer/inviter/rejoindre/quitter | Tout atteignable au clavier | | | | |
| G2 | **Lecteur d'écran** dans le lobby | Statut de synchro annoncé (`aria-live`, A11Y-1 corrigé) | | | | |
| G3 | **Lecteur d'écran** : erreur réseau dans les collections | Annoncée (`role=alert`, A11Y-4 corrigé) | | | | |
| G4 | **Lecteur d'écran** : présence des participants | Statut (hôte/pause/absent/parti) annoncé (A11Y-2 corrigé) | | | | |
| G5 | Popover VARA : piège de focus | Tab confiné au popover, focus restauré à la fermeture (A11Y-3 corrigé) | | | | |
| G6 | **RTL** (arabe) : lobby, collections | Miroir correct, pas de casse | | | | |
| G7 | **Mobile** : cibles tactiles, débordements | Utilisable | N/A | | | |
| G8 | **États vides** (aucune collection, aucun item, room vide) | Message clair, pas d'écran mort | | | | |

## H. Confidentialité (scénario 10) — **gate strict**

À vérifier **console/terminal visibles** pendant tout le parcours + inspection du payload
bug-report si déclenché.

| # | Vérification | Attendu | Résultat |
| --- | --- | --- | --- |
| H1 | Ouvrir le play-picker avec une clé TorBox | Aucune `transportUrl`/clé API dans les logs (PRIV-1 corrigé) | |
| H2 | Autoload de sous-titres | Aucun moviehash/imdbId/saison/épisode logué (PRIV-2 corrigé) | |
| H3 | Échec de chargement de sous-titre | Aucune URL de sous-titre loguée (PRIV-3 corrigé) | |
| H4 | Recherche de sous-titres | Aucune requête/titre logué (PRIV-4 corrigé) | |
| H5 | Tout le parcours VEYA | Aucun média/URL/source/infoHash/IP/appareil/session Stremio sur le fil VEYA ni en logs | |
| H6 | Déclencher « signaler un bug » | Inspecter le payload : aucune URL/magnet/jeton hex (scrubbé, PRIV-BUGREPORT corrigé) | |
| H7 | Si `together`/`useRoomSync` est emprunté | ⚠️ `infoHash`/`mediaId` sur le canal (**DEF-VEYA-BOUNDARY**, hors Watch Room) — consigner | |

---

## Consignation

Pour chaque ligne : plateforme, build (commit), verdict, preuve. Les lignes ⚠️ « attendu
défaillant » sont des **FAIL attendus** liés à des défauts documentés non corrigés — leur
FAIL confirme l'audit, il ne bloque pas la recette. Reporter la synthèse dans le rapport de
qualification.
