# Compte rendu — implémentation complète de CIRA

**Projet** : VAYRA — A product by EYBO
**Date** : 13 juillet 2026
**Branche** : `feat/cira-complete`
**État** : implémentation terminée, validée localement et poussée sur GitHub

## Objectif

Transformer le premier socle CIRA en un domaine social privé complet pour
VAYRA, couvrant les relations individuelles, les groupes, les invitations,
les rôles, la présence et les notifications, sans exposer les données de
visionnage.

## Fonctionnalités livrées

### Profil CIRA

- Création et modification d'un profil lié au compte Supabase.
- Handle unique et nom affiché.
- Avatar sélectionné dans le catalogue local VAYRA.
- Aucune URL d'avatar distante ou donnée traçante.

### Relations privées

- Demande par handle.
- Acceptation, refus et annulation.
- Suppression d'une relation acceptée.
- Blocage et déblocage.
- Invitations temporaires, révocables et à usage unique.

### Groupes CIRA

- Création, modification et suppression de groupes privés.
- Limite configurable de 2 à 250 membres.
- Rôles `owner`, `admin` et `member`.
- Promotion et rétrogradation des membres.
- Exclusion d'un membre.
- Départ volontaire d'un groupe.
- Transfert explicite de propriété.
- Suppression automatique du groupe lors de la suppression du compte
  propriétaire.

### Invitations de groupe

- Invitation directe réservée à une relation CIRA acceptée.
- Acceptation, refus et annulation.
- Liens opaques et temporaires à usage unique.
- Révocation des liens actifs.
- Aperçu du groupe avant de le rejoindre.
- Parcours public :
  `https://vayra.eybo.tech/cira/group#t=…`.
- Deep link natif : `vayra://cira/group#t=…`.

### Présence

- Consentement désactivé par défaut.
- États limités à `offline`, `online` et `in_vara`.
- Heartbeat par session et expiration automatique.
- Aucun partage de média, room, position, appareil ou dernière activité.

### Boîte sociale

- Compteurs de demandes et d'invitations reçues.
- Synchronisation entre appareils.
- Marquage « vu » persistant.
- Aucun historique d'activité : seul un horodatage `seen_at` est conservé.

### Pagination et performances

- Pagination serveur bornée pour les relations et membres de groupe.
- Pages limitées à 100 éléments maximum.
- Chargement progressif depuis l'interface.
- Rafraîchissement Realtime coalescé.
- Relecture de présence uniquement lorsqu'un état actif peut expirer.

## Sécurité et confidentialité

- L'identité CIRA repose uniquement sur `auth.users.id`.
- Elle reste indépendante de la session Stremio et des profils locaux.
- Les tables CIRA ne contiennent aucune bibliothèque, source, extension,
  position de lecture, adresse IP ou information d'appareil.
- Les codes d'invitation en clair ne sont jamais stockés.
- Seul leur hash SHA-256 normalisé est conservé au repos.
- Les codes transitent dans le fragment URL et non dans une query string.
- Les tables sensibles ne sont pas accessibles directement par les rôles API.
- Les mutations passent par 42 RPC `security definer` avec un
  `search_path` vide.
- Le rôle `anon` ne peut ni lire ni exécuter les opérations CIRA.
- Les invalidations Realtime utilisent un payload vide.
- Les demandes par handle n'exposent qu'un reçu aveugle identique, sans profil
  ni identifiant cible avant acceptation.
- Un blocage supprime la relation, les invitations communes et les groupes
  partagés concernés.
- Une garde serveur empêche deux personnes bloquées de rejoindre à nouveau
  le même groupe, même via un lien créé par un tiers.

## Base de données

Le domaine comprend 11 tables publiques :

1. `cira_profiles` ;
2. `cira_friendships` ;
3. `cira_request_receipts` ;
4. `cira_blocks` ;
5. `cira_presence` ;
6. `cira_invitations` ;
7. `cira_groups` ;
8. `cira_group_members` ;
9. `cira_group_invites` ;
10. `cira_group_links` ;
11. `cira_inbox_state`.

Le ledger privé `private.cira_rate_limits` constitue la douzième table.

Onze migrations sont disponibles dans `supabase/migrations/`. Elles doivent
être appliquées strictement dans l'ordre de leurs timestamps.

## Interface et internationalisation

- Gestion complète depuis **Réglages → CIRA**.
- Parcours relations, groupes, membres, rôles, invitations et boîte sociale.
- Pages d'invitation compatibles LTR et RTL.
- Traductions disponibles en anglais, français, allemand, espagnol, italien,
  portugais et arabe.

## Éléments volontairement exclus

Les fonctionnalités suivantes ne font pas partie de CIRA afin de respecter le
périmètre privacy-first :

- chat ;
- fil social ;
- commentaires et likes ;
- followers ;
- recherche publique ;
- recommandations algorithmiques ;
- import de contacts ;
- partage automatique de bibliothèque, historique, addons ou lecture.

Le player, libmpv, le cast, VARA/VEYA, le relay, Stremio et le moteur P2P
n'ont pas été modifiés par ces travaux.

## Micro-commits principaux

- `8c643b9` — `feat(cira-db): add private groups and memberships`
- `fedfbc5` — `feat(cira-db): add transactional group operations`
- `3839aa3` — `feat(cira-db): secure complete group invitations`
- `f985ecf` — `feat(cira): expose complete group repository`
- `5f24095` — `feat(cira): deliver complete private group UI`
- `89d7a21` — `feat(cira): complete private group invite journey`
- `b262fdb` — `feat(cira): complete private profile avatars`
- `de5eeaa` — `fix(cira): enforce blocks across private groups`
- `8f2da92` — `feat(cira): add privacy-first social inbox`
- `b369045` — `perf(cira): paginate private social lists`
- `0f6baa9` — `fix(cira): keep pagination reachable for pending lists`
- `86a3425` — `docs(cira): publish complete delivery and operations guide`
- `66758b9` — `feat(i18n): localize complete CIRA group flows`

## Validations exécutées

| Validation | Résultat |
|---|---|
| Harnais PostgreSQL | voir la dernière exécution documentée ; le harnais compte désormais 18 fichiers SQL |
| Tests Vitest | 283/283 réussis |
| `pnpm exec tsc -b` | Succès |
| `pnpm lint` | Succès, aucune alerte ESLint |
| `pnpm build` | Succès |
| Syntaxe JavaScript des pages d'invitation | Succès |
| `git diff --check` | Succès |

Le build affiche uniquement des avertissements déjà connus concernant le
découpage de certains chunks, les imports dynamiques et `lottie-web`. Ils ne
bloquent pas la compilation.

## État Git

- Branche de livraison : `feat/cira-complete`.
- Dernier commit fonctionnel avant ce rapport : `66758b9`.
- Branche locale synchronisée avec `origin/feat/cira-complete`.
- Tous les travaux ont été poussés sous forme de micro-commits.

## Étapes restantes avant production

1. Fusionner `feat/cira-complete` dans `main` après revue.
2. Appliquer les 12 migrations CIRA dans le projet Supabase de production.
3. Vérifier les comptages, RLS, RPC et triggers après migration.
4. Réaliser une recette avec au moins deux comptes et deux appareils.
5. Tester les invitations web et deep links sur desktop et Android.
6. Vérifier la présence et son expiration après une fermeture brutale.
7. Vérifier le transfert de propriété et les blocages inter-groupes.
8. Confirmer l'absence de régression Stremio, VARA/VEYA, player et cast.

La migration Supabase de production et la recette multi-appareils ne sont pas
présentées comme réalisées : elles restent des opérations séparées nécessitant
les accès et environnements de production.
