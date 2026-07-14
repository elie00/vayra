# VAYRA — compte rendu CIRA Groups v2

**Produit :** VAYRA — *A product by EYBO*

**Date :** 14 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra`

**Commit de référence :** `c714215`

**Verdict :** livré, audité par revue adversariale, et **DÉPLOYÉ EN BÊTA PRIVÉE**.

## 1. Résumé exécutif

CIRA Groups v2 ajoute deux capacités aux groupes privés CIRA :

- **Archivage / restauration** d'un groupe : un owner ou admin gèle un groupe —
  plus aucune entrée ni contenu (membres, invitations, liens, collections,
  items, VARA de groupe) — sans rien détruire, puis le restaure.
- **Invitation groupée** : un owner ou admin invite en une action plusieurs
  relations CIRA acceptées, avec un résultat agrégé qui ne devient pas un oracle
  sur les relations ou les blocages d'un tiers.

Le travail a été implémenté de bout en bout (SQL, client, UI, i18n, tests), puis
soumis à une **revue adversariale multi-agents** qui a intercepté un trou de
sécurité avant le déploiement. Les migrations ont été appliquées et auditées sur
le projet Supabase VAYRA, avec une recette transactionnelle intégralement verte
et sans résidu. La confidentialité reste un invariant : aucune source, URL,
addon, progression, bibliothèque, IP, appareil ni session Stremio n'est stockée
ou révélée.

## 2. Décisions produit (bloqueurs tranchés)

- **VARA depuis un groupe archivé** : garde côté serveur. `vara_create_room`
  reçoit un `p_group_id` optionnel ; s'il désigne un groupe archivé (ou dont
  l'appelant n'est pas membre), la création est refusée. Ce n'est donc pas une
  simple contrainte d'interface.
- **Résultat de l'invitation groupée** : agrégat strict `{invited,
  already_member, skipped}`, jamais de ventilation par personne.
- **Capacité** : invitation partielle jusqu'à la limite du groupe, le surplus
  compté en `skipped`.
- **Invitations / liens à l'archivage** : conservés inertes (pas de purge), pour
  « archiver sans détruire » et éviter une inversion de verrous (voir §6).
- **Actions de l'owner sur un groupe archivé** : delete, restore et transfert de
  propriété restent permis ; seuls les ajouts sont gelés. Rename reste permis.

## 3. Comportement d'un groupe archivé

| Surface | Actif | Archivé |
| --- | --- | --- |
| Lecture (membres, collections, items) | ouverte | ouverte |
| Renommer / éditer les métadonnées (owner/admin) | oui | oui |
| Inviter, lien, invitation groupée | oui | refusé `GROUP_ARCHIVED` |
| Accepter une invitation ou un lien | oui | refusé au niveau admission |
| Créer une collection, ajouter/déplacer/retirer un item | oui | refusé `GROUP_ARCHIVED` |
| Lancer une VARA de groupe | oui | refusé `GROUP_ARCHIVED` |
| Archiver / restaurer / supprimer (owner/admin) | — | oui |
| Blocage d'un membre | retire le membre | retire le membre (le blocage prime) |

Le gel de toute admission passe par le trigger `before insert` sur
`cira_group_members` (couvre acceptation d'invitation, de lien et insertion
directe). Le gel de tout le contenu de collection passe par le helper unique
`private.vara_lock_collection` (update, delete, add/remove/move item), tandis
que les lectures, qui ne prennent pas ce verrou, restent ouvertes.

## 4. Modèle SQL

- Colonne nullable `cira_groups.archived_at` (null = actif) — additive, sans
  backfill, entièrement rétrocompatible ; index partiel des groupes actifs.
- `private.cira_group_is_archived(uuid)` ; garde `GROUP_ARCHIVED` ajoutée au
  trigger d'admission, à `vara_lock_collection`, et aux RPC qui créent
  invitation/lien/collection/VARA de groupe.
- `cira_archive_group` / `cira_restore_group` (owner/admin, null-safe,
  idempotents) ; `archived_at` exposé dans les JSON de lecture.
- `vara_create_room` recréé avec un 3e paramètre `p_group_id uuid default null`.
- `cira_invite_group_members(uuid, uuid[])` : transactionnelle sous verrou du
  groupe, borne 50/appel, rate limit, idempotente (`on conflict do update`).

## 5. Confidentialité de l'invitation groupée (anti-oracle)

Le résultat n'expose que trois compteurs. `already_member` est déjà visible de
l'appelant (il liste les membres) ; `skipped` n'agrège **que** les conditions
que le flux mono-invitation révèle déjà — un blocage appelant↔cible, ou
l'absence de relation acceptée — plus la capacité. Il **n'agrège jamais** le fait
qu'une cible bloque un membre existant : une cible dans ce cas est **invitée**
(comme en mono-invitation) puis rejetée à l'acceptation par le trigger
d'admission, événement visible du seul invité. L'appel est ainsi au plus aussi
révélateur que le flux mono existant.

## 6. Revue adversariale — 6 findings confirmés, tous corrigés

- **HIGH (sécurité)** : la version initiale filtrait le blocage cible↔membre et
  le pliait dans `skipped`, créant un oracle sur la liste de blocage privée d'un
  tiers (un tableau à un élément neutralise l'agrégat). Corrigé : filtre retiré,
  comportement aligné sur la mono-invitation.
- **HIGH (interface)** : `GroupLinkDecision` bouclait car `useT()` (identité
  changeante à chaque rendu) figurait dans les dépendances d'un effet. Corrigé
  par une référence stable.
- **MEDIUM ×2 (concurrence)** : `cira_archive_group` supprimait invitations et
  liens, prenant leurs verrous après celui du groupe et inversant l'ordre de
  `cira_accept_group_invite` / `_link` — interblocage possible. Corrigé : plus de
  purge, entrées conservées inertes.
- **MEDIUM (interface)** : `GroupDetails.load` sans garde de course ; une réponse
  périmée pouvait écraser le groupe fraîchement sélectionné. Corrigé par un
  identifiant de requête monotone.
- **LOW (interface)** : « Lancer une VARA » désormais désactivé sur un groupe
  archivé.

## 7. Interface

- Badge « Archivé », actions Archiver / Restaurer (owner/admin), gel visuel des
  contrôles d'ajout sur un groupe archivé (lecture seule).
- L'invitation mono-relation devient une **multi-sélection** (cases à cocher sur
  les relations acceptées non-membres, tout sélectionner, « Inviter (n) ») avec
  un toast **agrégé** — jamais un résultat par personne.
- 12 chaînes traduites dans les 7 langues (parité vérifiée par test).

## 8. Validations exécutées

| Contrôle | Résultat |
| --- | --- |
| `bash scripts/cira/db-test.sh` | Succès — 22 fichiers SQL sur 22 |
| `pnpm test` (`vitest run`) | Succès — 370 tests |
| `pnpm exec tsc -b` | Succès |
| `pnpm lint` (`eslint --max-warnings 0`) | Succès |
| `pnpm exec vite build` | Succès |
| Revue adversariale multi-agents (4 dimensions) | 6 findings confirmés, tous corrigés |

Tests ajoutés : `supabase/tests/20_group_archive.sql` (gel exhaustif, lectures
et rename ouverts, invitations conservées inertes, blocage prioritaire,
idempotence, VARA de groupe) et `21_group_bulk_invite.sql` (agrégat non
attribuable, anti-oracle, capacité partielle, idempotence, rôles, borne,
archivé). Invariants d'audit `00_audit.sql` mis à jour (whitelist `archived_at`,
45 RPC publiques `cira_`). Tests client pour les trois RPC, le décodage agrégé
et `createRoom` avec contexte de groupe.

## 9. Déploiement Supabase

- **Migrations** : `20260714200000_cira_groups_archive.sql`
  (sha256 `9392b2d98178d5a39532084bf1a4401c86c387c63e3c237259c7c352709d722c`) et
  `20260714210000_cira_group_bulk_invite.sql`
  (sha256 `cd9e98b2b24bdd8f098fda06942c35b90177f936bb6a828a689137102dc9ebbc`).
- **Prévol** : les deux migrations étaient les seules manquantes de l'historique
  distant.
- **Sauvegarde** : hors dépôt, permissions utilisateur uniquement, contenant les
  définitions des neuf fonctions recréées, un manifeste horodaté et `SHA256SUMS`.
- **Dry-run** transactionnel sur la base réelle (annulé, sans résidu), puis
  **application en transaction unique** ; les deux versions sont enregistrées
  dans `supabase_migrations.schema_migrations`.
- **Audit post-migration** : colonne `archived_at` présente ; les trois RPC
  toutes `security definer`, `search_path` verrouillé, accordées à
  `authenticated` seul ; helper `private` sans droit API ; `vara_create_room`
  en 3 arguments ; gardes `GROUP_ARCHIVED` dans le trigger d'admission et
  `vara_lock_collection` ; correctif anti-oracle vérifié en base.
- **Recette transactionnelle** : 9 contrôles verts — compteurs agrégés sans
  fuite d'ids, cible bloquée-par-membre invitée puis rejetée à l'acceptation,
  gel invite/collection/VARA sur archivé, invitations conservées inertes,
  restauration fonctionnelle, idempotence. Rollback intégral, aucun résidu.

## 10. Risques restants

- L'entrée `schema_migrations` porte une note de source (déploiement via la
  Management API, ports PostgreSQL directs inaccessibles) ; sans incidence, la
  comparaison d'historique se fait sur la version.
- La recette d'interface (multi-sélection, badge archivé, gel visuel) n'a pas été
  rejouée en navigateur ; elle est couverte par les tests et le build, et
  réalisable avec un compte bêta comme pour Collections.

## 11. Micro-commits

- `00c5600` — `feat(cira): groups v2 backend — archive/restore and bulk invite`
- `7e85a19` — `feat(cira): groups v2 client + UI — archive/restore and multi-invite`
- `5d48fa4` — `fix(cira): freeze collection content on archived groups`
- `c714215` — `fix(cira): resolve adversarial-review findings in groups v2`

`main` et `origin/main` pointent sur `c714215`.

## 12. Fichiers de référence

- `supabase/migrations/20260714200000_cira_groups_archive.sql`,
  `20260714210000_cira_group_bulk_invite.sql`.
- `supabase/tests/20_group_archive.sql`, `21_group_bulk_invite.sql`.
- `src/lib/cira/` : repository, types, erreurs de Groups v2.
- `src/views/settings/cira-groups-card.tsx` : archive/restore et multi-invitation.
- `docs/compte-rendu-vara-collections.md`, `docs/deploiement-vara-collections.md` :
  livraison et déploiement de la surface Collections liée.
