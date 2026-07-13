# VAYRA — compte rendu CIRA, VARA distante et VEYA

**Produit :** VAYRA — *A product by EYBO*

**Date :** 13 juillet 2026

**Dépôt :** `elie00/vayra`

**Branche de référence :** `main`

**État de référence :** `1bae811`
**Verdict :** socle prêt pour une bêta privée contrôlée, sous réserve de la
recette manuelle de lecture sur deux appareils décrite à la fin de ce document.

## 1. Résumé exécutif

Les travaux ont livré puis déployé deux domaines complémentaires :

- **CIRA**, le cercle privé VAYRA : profils, relations, blocages, groupes,
  invitations, présence volontaire et boîte sociale ;
- **VARA distante**, la room privée temporaire, avec invitations CIRA ou lien
  court sécurisé ;
- **VEYA**, la synchronisation minimale de lecture entre les membres d'une
  VARA, transportée sur un canal Supabase Realtime privé.

Le code a été fusionné sur `main`, poussé sur GitHub et les migrations ont été
appliquées au projet Supabase VAYRA. Les recettes SQL à deux comptes, les tests
frontend, le build et les workflows GitHub Actions sont passés.

La confidentialité reste un invariant d'architecture : aucune source vidéo,
URL, bibliothèque, historique, addon, adresse IP, appareil ou session Stremio
n'est enregistré dans CIRA/VARA ou envoyé par VEYA.

## 2. CIRA livré

### 2.1 Profils et relations

- Profil minimal lié à `auth.users.id`.
- Handle unique, nom affiché et avatar issu du catalogue local.
- Demande directe avec découverte aveugle du handle.
- Acceptation, refus, annulation et suppression d'une relation.
- Blocage et déblocage avec suppression immédiate des frontières partagées.
- Invitation opaque, temporaire, révocable et sans secret stocké en clair.

### 2.2 Groupes privés

- Groupes de 2 à 250 membres.
- Rôles `owner`, `admin` et `member`.
- Création, édition, suppression, départ et exclusion.
- Promotion, rétrogradation et transfert explicite de propriété.
- Invitations directes limitées aux relations CIRA acceptées.
- Liens de groupe opaques, temporaires, révocables et à usage unique.
- Garde transversale empêchant deux comptes bloqués de rejoindre le même
  groupe, y compris par un lien émis par un tiers.

### 2.3 Présence et boîte sociale

- Présence désactivée par défaut et soumise au consentement explicite.
- États strictement limités à `offline`, `online` et `in_vara`.
- Heartbeat, TTL et expiration automatique sans `last_seen_at` public.
- Compteurs de demandes et invitations reçues, synchronisés entre appareils.
- Aucun journal social : seule la date `seen_at` de la boîte est persistée.
- Pagination serveur bornée pour les relations et membres.

### 2.4 Surface technique CIRA

- 11 tables publiques CIRA et un ledger privé de rate limiting.
- 42 RPC publiques `security definer`, `search_path` vide et caller dérivé de
  `auth.uid()`.
- Aucun droit d'exécution CIRA pour `anon`.
- RLS, invalidations Realtime privées et payload métier vide.
- Client typé dans `src/lib/cira/`.
- Interface complète dans les réglages VAYRA.
- Pages publiques `/cira/invite` et `/cira/group` avec transmission du secret
  dans le fragment URL.
- Traductions en anglais, français, allemand, espagnol, italien, portugais et
  arabe.

## 3. VARA distante et VEYA livrées

### 3.1 Rooms privées

- Rooms temporaires privées de 2 à 16 membres.
- Expiration maximale de 24 heures.
- Propriétaire, hôte courant, lease d'hôte de 90 secondes et transfert.
- Topic Realtime opaque de la forme `vara:<32 caractères hexadécimaux>`.
- Rotation du topic à chaque changement de frontière de sécurité.
- Room active et snapshots conservés uniquement en mémoire côté client.
- Déconnexion réseau distincte d'un départ explicite : une reconnexion ne
  supprime pas l'appartenance persistante.

### 3.2 Invitations VARA

- Invitation directe réservée à une relation CIRA acceptée.
- Acceptation, refus, annulation et révocation.
- Lien court à secret opaque, expiration maximale d'une heure et nombre
  d'utilisations limité.
- Seul le hash du secret est stocké au repos.
- Route publique `/vara/invite` puis deep link
  `vayra://vara/invite#t=…`.
- Le fragment est retiré de l'historique du navigateur avant l'ouverture de
  l'application.
- Un blocage CIRA retire immédiatement l'appartenance partagée et fait tourner
  le topic.

### 3.3 Synchronisation VEYA

- Transport `WebSocketTransport` basé sur Supabase Realtime privé.
- Synchronisation limitée à `play`, `pause`, `seek` et à un état minimal de
  position.
- Révisions monotones, corrélation des commandes et suppression des boucles.
- Heartbeat d'autorité toutes les trois secondes.
- Correction de dérive progressive : tolérance sous 0,75 seconde, correction
  douce jusqu'à 2 secondes, puis seek au-delà.
- Reconnexion exponentielle bornée et snapshot tardif en mémoire.
- Une session Together historique et une VARA distante ne pilotent jamais le
  lecteur simultanément.
- Le cast conserve son chemin existant et suspend VEYA.

Le player, libmpv, HDR, shaders, P2P, cast et Stremio n'ont pas été modifiés
par ces travaux.

## 4. Base de données et déploiement Supabase

### 4.1 Migrations CIRA

Les douze migrations présentes ont été appliquées dans l'ordre, depuis
`20260713171654_cira_schema.sql` jusqu'à
`20260713280000_restrict_rls_auto_enable.sql`. Le douzième fichier est un
durcissement ajouté après le lot fonctionnel initial de onze migrations.

Le déploiement CIRA a été vérifié par une recette liée à deux comptes. La
barrière de bêta privée `cira_beta` reste volontairement active.

### 4.2 Migrations VARA

Les migrations suivantes ont été appliquées transactionnellement et inscrites
dans `supabase_migrations.schema_migrations` :

- `20260713290000_vara_remote_rooms.sql` ;
- `20260713300000_vara_remote_invites.sql`.

L'audit distant après déploiement a confirmé :

- 4 tables VARA sur 4 avec RLS activée ;
- 18 RPC VARA publiques, toutes `security definer` et protégées par la garde
  d'identité VAYRA ;
- aucun droit d'exécution `anon` ou `PUBLIC` ;
- 2 policies Realtime VARA ;
- le trigger de frontière de blocage actif ;
- les 2 migrations VARA présentes dans l'historique distant ;
- aucune donnée synthétique résiduelle après la recette.

La configuration Realtime a été limitée à la modification nécessaire :
`private_only=true` et `presence_enabled=true`. Le service reste actif et les
quotas existants n'ont pas été changés.

Les ports PostgreSQL 5432 et 6543 étant inaccessibles depuis le poste de
travail, les migrations ont été exécutées via l'endpoint SQL HTTPS officiel de
la Supabase Management API. Aucun secret n'a été écrit dans le dépôt.

## 5. Sauvegardes et recettes distantes

- Sauvegarde logique pré-CIRA :
  `/Users/eybo/.codex/backups/vayra/2026-07-13-pre-cira/`.
- Manifeste structurel pré-VARA :
  `/Users/eybo/.codex/backups/vayra/2026-07-13-pre-vara/manifest.md`.
- Permissions du manifeste pré-VARA : `600`.
- SHA-256 du manifeste pré-VARA :
  `4708bf5a73e9173a79a3561077196f8642f988329f96f56fddb0a415ad072557`.
- Recette VARA distante : `scripts/vara/remote-smoke.sql`.
- Résultat : deux comptes synthétiques, relation CIRA, room, invitation
  directe, deux membres, secret hashé, rotation du topic et transfert d'hôte
  validés dans une transaction annulée en fin de test.
- Résidu distant après rollback : aucun compte synthétique.

## 6. Validations réellement exécutées

| Commande ou contrôle | Résultat |
| --- | --- |
| `bash scripts/cira/db-test.sh` | Succès — 18 fichiers SQL sur 18 |
| `pnpm test` | Succès — 34 fichiers, 311 tests |
| `pnpm exec tsc -b` | Succès |
| `pnpm lint` | Succès |
| `pnpm build` | Succès |
| `git diff --check` | Succès |
| `scripts/vara/remote-smoke.sql` sur Supabase | Succès, rollback propre |
| Audit RLS/RPC/policies distant | Succès |

Le build conserve uniquement des avertissements Vite préexistants sur certains
imports dynamiques, l'usage de `eval` dans une dépendance et la taille de
chunks. Ils ne bloquent pas le build.

### 6.1 GitHub Actions sur `main`

| Workflow | Run | Résultat |
| --- | --- | --- |
| CIRA DB | `29286546326` | Succès |
| Frontend | `29286545574` | Succès |
| Android build | `29286545516` | Succès, APK debug produit |

L'unique annotation non bloquante concerne le passage automatique d'actions
Node 20 vers Node 24 en raison de la dépréciation annoncée par GitHub.

## 7. Micro-commits VARA distante

- `d135cca` — `feat(vara-db): establish private remote rooms`
- `21a1e69` — `feat(vara-db): add CIRA room invitations`
- `5adaaf6` — `feat(vara): add remote room repository`
- `1084c21` — `feat(veya): add private WebSocket transport`
- `f52ff04` — `feat(vara): orchestrate authenticated remote rooms`
- `36d270b` — `feat(vara): add private invitation deep links`
- `670b76f` — `feat(vara): add remote room controls`
- `3551cd1` — `fix(vara): preserve rooms across transport disconnects`
- `49e7d50` — `feat(veya): synchronize remote playback controls`
- `d1d22ad` — `feat(vara): localize remote room experience`
- `638a9b9` — `feat(vara): complete private room lifecycle controls`
- `04a7f0a` — `docs(vara): document remote architecture and rollout`
- `1bae811` — `docs(vara): record private beta deployment`

La branche `feat/vara-remote` a été fusionnée en avance rapide. Au moment de ce
rapport, `main`, `origin/main` et `origin/feat/vara-remote` pointent sur
`1bae811`.

## 8. Limites et actions restantes

### 8.1 Recette manuelle obligatoire avant élargissement de la bêta

La recette de lecture réelle sur deux appareils ou deux instances n'a pas été
présentée comme réussie. Elle doit vérifier :

1. connexion de deux comptes autorisés à la bêta ;
2. création d'un profil et choix d'un handle CIRA pour chaque compte ;
3. relation CIRA acceptée puis invitation à une même VARA ;
4. ouverture locale du même contenu sur les deux appareils ;
5. play, pause et seek dans les deux sens ;
6. arrivée tardive et application du snapshot ;
7. transfert d'hôte ;
8. coupure réseau, reconnexion et conservation de l'appartenance ;
9. absence de boucle de commandes et dérive acceptable ;
10. cast suspendant VEYA sans modifier le comportement de lecture existant.

### 8.2 Exploitation

- Un compte auquel le flag `cira_beta` vient d'être ajouté doit rafraîchir son
  JWT, généralement par une déconnexion/reconnexion.
- L'utilisateur doit encore choisir un handle CIRA avant d'utiliser les
  invitations directes.
- La bêta doit rester limitée aux comptes explicitement autorisés jusqu'à la
  recette manuelle multi-appareils.
- Les tests Windows et Linux restent confiés à GitHub Actions.
- Tout mot de passe ou credential partagé hors du dépôt doit être renouvelé
  selon la procédure d'exploitation habituelle.

## 9. Fichiers de référence

- `docs/cira-complete-report.md` : périmètre fonctionnel complet CIRA.
- `docs/cira-compte-rendu.md` : historique détaillé de l'implémentation CIRA.
- `docs/vara-veya-architecture.md` : architecture distante et invariants.
- `docs/vara-veya-implementation-report.md` : livraison et déploiement VARA.
- `supabase/README.md` : ordre des migrations et procédures base de données.
- `scripts/cira/remote-smoke.sql` : recette distante CIRA.
- `scripts/vara/remote-smoke.sql` : recette distante VARA.

Les anciens rapports restent des instantanés historiques. Lorsqu'ils indiquent
que CIRA ou VARA n'était pas encore déployé, le présent document daté constitue
l'état consolidé le plus récent.
