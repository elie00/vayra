# VAYRA Watch Room — audit du parcours end-to-end + liste priorisée des défauts

**Produit :** VAYRA — *A product by EYBO* · **Branche :** `main` (≥ `f601b314`)
**Périmètre :** CIRA + VARA + VEYA + Collections v2. LUMA hors synchronisation sociale.
**Méthode :** audit statique multi-agents (6 dimensions, chaque défaut candidat vérifié
adversarialement) + re-audit ciblé du moteur VEYA. Aucune observation sur binaire réel
(voir le rapport de qualification pour les scénarios exigeant deux appareils).

---

## 0. Constat d'architecture (à lire avant tout)

Il existe **trois systèmes de « room » distincts** ; les confondre fausse l'audit :

| Système | Fichiers | Rôle | Confidentialité du fil |
| --- | --- | --- | --- |
| **VEYA / VARA distant** — *le vrai Watch Room* | `src/lib/vara/*`, `src/lib/together/sync/websocket-transport.ts`, `use-veya-sync.ts`, migrations `20260713290000/300000` | Rooms privées Supabase, hôte, invitations, liens, synchro de lecture | **Propre** : position seule (`rev/playing/positionSec/rate/buffering/ended/anchorAtMs`), aucun média sur le fil |
| **`together` / `useRoomSync`** — système plus ancien | `use-room-sync.ts`, `src/lib/together/protocol.ts` | Co-visionnage local/Luma | **Émet `infoHash` + `mediaId` + `posterUrl`** sur son canal (voir DEF-VEYA-BOUNDARY) |
| **`use-vara-room.ts`** — démo locale | `use-vara-room.ts`, `use-lobby-gate.ts` | Room fixe `vara-demo` via `LocalTransport` | N/A (glue de présentation, n'appelle aucune RPC) |

**Autorité VEYA** : l'hôte (utilisateur) ; parmi ses présences, le `clientId` le plus bas
est élu unique publieur. Heartbeat d'état toutes les 3 s. Les invités réconcilient via
logique pure (`reconcile.ts` : soft ≥ 0,75 s → nudge de vitesse, hard ≥ 2,0 s → seek).

**Modèle de sécurité serveur** (sain dans la forme) : tables deny-all, RPC `security
definer` avec `search_path` épinglé, verrou `FOR UPDATE` sur la ligne room comme point de
sérialisation, topic Realtime opaque **tourné à chaque changement d'appartenance**, RLS
`realtime.messages` via `private.vara_topic_access` (membre + actif + non-expiré ; hôte +
bail requis pour émettre état/snapshot). L'appartenance est **coupée au niveau DB/RLS** sur
leave/block/close/expiry ; le démontage du canal côté client reste **coopératif**.

---

## 1. Seams du parcours (fichier:ligne — rôle)

### 1.1 Cycle de vie VARA (création → invitation → hôte → sortie → révocation)
- `src/lib/vara/repository.ts:246` — `rpc()` : porte d'auth + normalisation des codes d'erreur SQL, traversée par **toutes** les RPC room/invite/link.
- `src/lib/vara/provider.tsx:140` — broadcast privé `cira:{userId}` → `refresh()` : **unique** voie push propageant admissions/retraits/invitations/changements d'hôte.
- `src/lib/vara/provider.tsx:154` — `activateRoom` → `transport.join(room.id)` : entrée dans le canal Realtime ; bloque si `togetherSnapshot.state==='joined'` (`VARA_SYNC_CONFLICT`).
- `src/lib/together/sync/websocket-transport.ts:237` — `connect()` : résolution du topic courant, souscription, présence, demande de snapshot.
- `…websocket-transport.ts:395` — `refreshDescriptor()` : sur `changed`, reconnexion au topic tourné **ou** démontage si `getRoom` échoue (éviction du membre retiré).
- `…websocket-transport.ts:425` — `tickLease()` (15 s) : l'hôte renouvelle le bail, un invité revendique l'hôte à expiration.
- `migrations/20260713290000:88` — `private.vara_topic_access` : cœur RLS Realtime.
- `migrations/20260713290000:293` — `vara_leave_room` : owner-leave supprime la room ; sinon retire le membre, réassigne l'hôte, **tourne toujours le topic**.
- `migrations/20260713300000:85` — `private.vara_admit_member` : `FOR UPDATE` room = point de sérialisation (capacité, blocage, rotation topic) à chaque join.
- `migrations/20260713300000:545` — trigger `vara_tg_cira_block_boundary` : sur blocage, supprime invites croisées, retire un côté de chaque room partagée, tourne le topic.
- `migrations/20260714220000:497` — `vara_create_room(3-arg)` : `p_group_id` ne gate que l'archivage **à la création** ; `group_id` **non persisté** sur `vara_rooms`.

### 1.2 Moteur VEYA (play/pause/seek/snapshot/dérive/transfert)
- `use-playback-controls.ts:81-89 / 108-131` — points d'émission play/pause/seek.
- `use-veya-sync.ts:106-121` — application des commandes distantes (dedup LRU par corr).
- `use-veya-sync.ts:124-159` — correction de dérive (garde de rev, extrapolation, nudge/seek).
- `use-veya-sync.ts:162-173` — application du snapshot d'arrivée tardive.
- `reconcile.ts:7-8` — seuils `SOFT_DRIFT=0,75` / `HARD_DRIFT=2,0`.
- `websocket-transport.ts:254-271` — souscription → `track` présence + `snapshot-request`.
- `websocket-transport.ts:293-296` — l'autorité répond au `snapshot-request` (**broadcast** canal entier).
- `player.tsx:532-552` — boucle de heartbeat d'état de l'hôte (3 s).

### 1.3 Cast + plateformes
- `player.tsx:212` — **seam de suspension VEYA sous cast** : `remoteVeyaActive = … && !cast.castDevice`.
- `use-cast-session.ts:117` — `castActiveRef = castDevice != null` (bascule **post-connexion**, pas au pick).
- `luma/authority.ts:30` — `deriveLumaAuthority` : cast prioritaire (conforme scénario 5).
- `use-player-bridge.ts:64-72` — sélection du moteur : Android→exo/html5, desktop live→html5, sinon mpv.
- `cast-button.tsx:14` — disponibilité cast **dérivée du moteur** (`capabilities.airplay||chromecast`), non du support natif.
- Capacités cast par moteur : `mpv.ts:580` chromecast=true ; `html5/bridge.ts:734` chromecast=false ; `exo/bridge.ts:529` cast toujours désactivé (Android).

### 1.4 Contrôle d'accès (blocage/exclusion/expiration/archive + Collections v2)
- `migrations/20260714200000:465` — `private.vara_lock_collection` : **point de sérialisation unique** de toute mutation collection/item ; re-dérive le rôle null-safe + re-vérifie l'archivage.
- `migrations/20260714220000:55/76` — `vara_collection_can_manage` / `vara_collection_edit_level` : gardes null-safe (délégué non-membre = impuissant).
- `migrations/20260714220000:533` — trigger `vara_tg_purge_delegates_on_member_removal` : purge les délégations à la sortie du groupe.
- `migrations/20260714200000:41` — `cira_tg_group_members_block_guard` : porte d'admission (archive + blocage).
- `migrations/20260713250000:47` — `cira_block_user` : coupe l'accès immédiatement dans tous les groupes partagés.

### 1.5 Confidentialité / diagnostics
- `src/lib/bug-report.ts:166` — **unique sink hors-appareil** : POST `FormData` vers `bugs.harbor.site` (erreurs globales + stack). Déclenché **par action utilisateur** (`error-view.tsx:111`).
- `src/lib/together/protocol.ts:41` — `SyncState.source` porte `infoHash/fileIdx` (chemin `together`, **pas** VEYA).
- `src/lib/together/sync/types.ts:24` — type filaire VEYA : position seule, sûr par construction.

---

## 2. Liste priorisée des défauts réels (bloquants) — séparée du cosmétique

Statut : **CORRIGÉ** (ce lot, PR atomique), **DOCUMENTÉ** (fix prêt, exige observation ou
accord), **ACCORD** (changement de protocole de confidentialité → attend ton accord explicite).

### 2.1 Bloquants pour la sortie

| ID | Sév. | Scénario | Défaut | Statut |
| --- | --- | --- | --- | --- |
| **PRIV-1** | bloquant | 10 | `use-addons.ts` loguait la `transportUrl` TorBox = **clé API en clair** dans les logs | ✅ CORRIGÉ (`6ed008e`) |
| **PRIV-2** | majeur | 10 | `use-track-autoload.ts` loguait le **moviehash** (empreinte du contenu) + imdbId/saison/épisode | ✅ CORRIGÉ (`6ed008e`) |
| **PRIV-3** | majeur | 10 | `exo/bridge.ts` & `html5/bridge.ts` loguaient l'**URL de sous-titre** (porteuse d'id de contenu) | ✅ CORRIGÉ (`6ed008e`) |
| **PRIV-4** | mineur | 10 | `search-section.tsx` loguait la **requête** de sous-titres (= titre regardé) | ✅ CORRIGÉ (`6ed008e`) |
| **VEYA-B1** | bloquant | 3-4 | Snapshot diffusé au canal entier → **tempête de seek** : chaque (re)connexion force un seek sur tous les pairs déjà synchronisés | ✅ CORRIGÉ (`87acecb`) — garde de rev monotone |
| **VARA-1** | majeur | 6-7 | `connect()` bouclait en reconnexion infinie sur room définitivement disparue (TTL/close/révocation) → drain + UI bloquée | ✅ CORRIGÉ (`0da7b9d`) — teardown sur code permanent |
| **ACCESS-1** | majeur | 7 | Groupe archivé : `CollectionDetail` affichait encore Edit/Delete/Add/Move/Remove (serveur rejette, mais UI ≠ vérité serveur) | ✅ CORRIGÉ (`5a7f505`) |
| **A11Y-1** | bloquant | 9 | `waiting-for-room` : statut de synchro/prêt sans `aria-live` → lecteur d'écran jamais informé | ✅ CORRIGÉ (`5a7f505`) |
| **A11Y-4** | majeur | 9 | `cira-collections` : erreurs réseau rendues en texte nu sans `role=alert` | ✅ CORRIGÉ (`5a7f505`) |
| **VEYA-B2** | bloquant | 3-4 | **Aucune garde même-média** sur le fil VEYA : l'état/commandes de l'hôte s'appliquent à un invité affichant un **autre** contenu (le chemin `together` a `isDifferentMedia`, pas VEYA) | ✅ CORRIGÉ (`3cbd355`) — `contentKey` opaque (hash non identifiant) sur le fil, drop si divergence. **À observer** sur 2 appareils (bascule de média) |
| **A11Y-2** | bloquant | 9 | `avatar-dock` : présence/statut (hôte en pause, absent, non prêt) **visuel uniquement**, label en `display:none` au survol, dock non focusable | ✅ CORRIGÉ (`2025fb5`) — `aria-label` composé par avatar + région `aria-live` |

### 2.2 Majeurs non bloquants (à traiter avant élargissement)

| ID | Scénario | Défaut | Statut |
| --- | --- | --- | --- |
| **VARA-2** | 7 | Expiration TTL non reflétée dans la liste des rooms (aucun sweeper serveur, aucun broadcast) → room morte affichée « joignable » | ⏳ DOCUMENTÉ — fix : timer client dans `VaraProvider` prunant sur `expiresAt` |
| **VEYA-N1** | 3 | `applyState` n'applique jamais `setRate(state.rate)` → à 1,5×/2× l'hôte, les invités **seek-storment** toutes les ~2 s sans converger | ⏳ DOCUMENTÉ — fix : appliquer la vitesse de l'autorité avant la décision de dérive (nécessite `getLocalRate`) |
| **VEYA-N2** | 3 | Transfert d'hôte : le nouveau publieur ne heartbeat pas tant que le provider n'a pas rafraîchi `hostId` → trou d'autorité (voire permanent si pas de ping `changed`) | ⏳ DOCUMENTÉ — fix : piloter la boucle de publication depuis `transport.isAuthority()`, pas l'état provider |
| **CAST-1** | 5 | Fenêtre de **connexion cast** (`pendingCastDevice` posé, `castDevice` encore null) : ni VEYA ni room-sync gatés → commandes distantes pilotent le bridge local pendant l'attente | ⏳ DOCUMENTÉ — exige matériel cast ; fix : gater sur `pendingCastDevice` |
| **CAST-2** | 8 | Bouton cast gaté par le **moteur** (mpv=activé, html5/exo=désactivé) et non par le support natif → cast inatteignable pour le live/IPTV forcé sur html5 | ⏳ DOCUMENTÉ (différence de plateforme, à documenter au minimum) |
| **A11Y-3** | 9 | `together-modal` déclare `aria-modal` sans **piège de focus** ni restauration | ⏳ DOCUMENTÉ (`use-focus-trap` existe, non branché) |
| **A11Y-5** | 9 | `chat-overlay` : messages entrants sans `aria-live`, toast accessible supprimé en lecture | ⏳ DOCUMENTÉ |

### 2.3 Attendant ton accord explicite (protocole de confidentialité)

| ID | Défaut | Proposition |
| --- | --- | --- |
| **PRIV-BUGREPORT** | `submitErrorReport` expédie hors-appareil (`bugs.harbor.site`) les erreurs globales (600 c ×20) + la stack complète, sans liste blanche ni redaction. **Déclenché par l'utilisateur** (bouton « signaler »), donc consenti, mais le contenu peut porter URL/id de contenu | Ajouter une **liste blanche** de champs + scrubbing des URL/clés (`transportUrl`, chemins de fichier) avant envoi. **Changement de protocole de confidentialité → j'attends ton accord explicite** avant de toucher `bug-report.ts` |

### 2.4 Constats de frontière / limites connues (non-défauts, à consigner)

- **DEF-VEYA-BOUNDARY** : le chemin `together`/`useRoomSync` diffuse `infoHash`+`mediaId`+`posterUrl` sur son canal (`use-room-sync.ts:108-120`, `protocol.ts:33-46`). Ce n'est **pas** VEYA (le Watch Room), et ce n'est pas un sink « logs/analytics » — c'est une transmission fonctionnelle entre pairs de confiance. À auditer sous sa propre gouvernance si `together` reste actif ; **hors périmètre Watch Room**.
- **ARCHIVE-ROOM-GAP** : `cira_archive_group` gèle admissions/créations mais **n'évince pas** les rooms VARA déjà lancées depuis le groupe (`vara_rooms` n'a pas de `group_id`, `p_group_id` n'est vérifié qu'à la création). Une room lancée avant archivage continue jusqu'à son TTL (≤ 24 h), bornée par les checks d'amitié/blocage. À décider produit : persister `group_id` + évincer, ou accepter (documenté).
- **LINK-1** (mineur) : rejouer un lien valide en tant que **membre déjà présent** incrémente quand même `use_count` (`vara_accept_room_link` after `vara_admit_member` renvoie true) → consomme une utilisation. Fix : ne pas incrémenter si déjà membre.

### 2.5 Cosmétique (ne bloque pas la sortie)

- `use-vara-room.ts` : chemin de démo local parallèle au cycle distant (source de confusion d'audit, pas un bug fonctionnel).
- `repository.ts:createLink` : second `getSession()` redondant pour peupler `creatorId`.
- `vara_list_rooms` : `delete … where expires_at<=now()` global à chaque appel (GC partagé ; couple la latence de liste au volume d'expiration).

---

## 3. VEYA-B2 — corrigé (`3cbd355`)

Implémenté comme prévu : `contentKey` opaque non identifiant (hash FNV-1a de
`metaId|saison|épisode`, jamais l'id brut) ajouté au type filaire (optionnel, validé
strictement s'il est présent), estampillé par l'hôte (heartbeat) et par l'émetteur de
commande, comparé à l'application — **drop** si les deux clés sont présentes et diffèrent,
fail-open sinon (rétro-compatible). Fichiers : `content-key.ts`, `types.ts`,
`websocket-transport.ts` (parseurs), `use-veya-sync.ts`, `player.tsx`. Couvert par 8 tests
(déterminisme du hash + garde command/state/snapshot + fail-open).

**Reste à faire (humain)** : observer sur **deux appareils** qu'un invité qui bascule vers un
autre titre/épisode n'est plus happé, et qu'un invité sur le même contenu synchronise
toujours. La logique est verrouillée par les tests ; l'observation valide le comportement
réel (cf. ta DÉFINITION DE DONE).
