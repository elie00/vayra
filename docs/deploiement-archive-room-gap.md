# VAYRA — déploiement ARCHIVE-ROOM-GAP en base

**Produit :** VAYRA — *A product by EYBO*

**Date :** 15 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra`

**Commit déployé :** `a23b83b75f42e162d31192f97d7495920681a9de` (`main`)

**Projet Supabase :** `kbuwutnzqapwnvzgyjtw`

**Verdict :** DÉPLOYÉ EN BÊTA PRIVÉE.

## 1. Migration déployée

| Ordre | Fichier | SHA-256 |
| --- | --- | --- |
| 1 | `20260715120000_cira_archive_evicts_group_rooms.sql` | `c68d4c764b761f7679e77961e5f9a534de0549c3dd151cfbced7f46b1a041ed5` |

Cette migration corrige **ARCHIVE-ROOM-GAP** : archiver un groupe gelait les
admissions/créations mais **laissait tourner** les rooms VARA déjà lancées depuis
le groupe (jusqu'à leur TTL ≤ 24 h), car `vara_rooms` n'avait pas de `group_id` et
`p_group_id` n'était vérifié qu'à la création.

**Décision produit : « geler pour de vrai ».** Une room VARA ne porte aucune
donnée durable (ni média, ni historique, ni position) ; la fermer ne détruit rien
de persistant, ce qui est cohérent avec le contrat d'archivage (« geler le
group-VARA sans détruire de données »).

Changements :

- `vara_rooms` gagne une colonne **`group_id`** (nullable, `references
  cira_groups(id) on delete set null`) + index partiel
  `vara_rooms_group_id_idx … where group_id is not null`.
- `vara_create_room` (signature 3-args inchangée) **persiste** `group_id` et
  **verrouille la ligne groupe** avant d'insérer la room.
- `cira_archive_group` (signature inchangée) **ferme** les rooms encore ouvertes
  du groupe (`delete from vara_rooms where group_id = p_group_id`, cascade des
  membres) après avoir posé `archived_at`, puis notifie les membres.

### Sûreté des verrous

L'ordre est **groupe → room partout** : `vara_create_room` verrouille la ligne
groupe avant d'insérer ; `cira_archive_group` tient déjà le verrou groupe avant de
supprimer les rooms ; `admit`/`leave`/`close` ne prennent que la ligne room.
Aucun chemin ne verrouille room→groupe, donc **pas de deadlock** — contrairement à
la purge invites/liens délibérément omise en `20260714200000`.

### Effet côté client

Une room fermée fait échouer `getRoom` → `VARA_ROOM_UNAVAILABLE` → le teardown
propre du transport (correctif VARA-1) prend le relais, sans boucle de
reconnexion. Les rooms **sans groupe** (`group_id` null) sont intactes.

## 2. Prévol

- `supabase migration list --linked` : toutes les migrations antérieures
  synchronisées ; `20260715120000` était la **seule** absente (`remote` vide),
  dans le bon ordre timestamp.
- Working tree propre.
- Harness SQL local (`scripts/cira/db-test.sh`) : **23/23** fichiers passants, dont
  une assertion d'éviction ajoutée à `20_group_archive.sql` (la room du groupe
  disparaît à l'archivage ; une room hors-groupe survit).

## 3. Sauvegarde

- Dump structurel du schéma distant **avant** application, hors dépôt, permissions
  utilisateur uniquement (`chmod 600`), 196 Ko.
- Aucune URL, aucun token, aucune donnée utilisateur.

## 4. Dry-run et application

- `supabase db push --linked --dry-run` : confirme une **seule** migration
  (`20260715120000_cira_archive_evicts_group_rooms.sql`).
- `supabase db push --linked` : appliquée en transaction unique, enregistrement
  automatique dans `supabase_migrations.schema_migrations`.

## 5. Audit post-déploiement (non destructif)

`supabase migration list --linked` puis dump distant frais et inspection du schéma :

| Contrôle | Résultat |
| --- | --- |
| Migration `20260715120000` enregistrée | ✅ `remote = 20260715120000` |
| Colonne `vara_rooms.group_id` | ✅ **nullable** (`"group_id" "uuid",`) |
| Clé étrangère | ✅ `→ cira_groups(id) ON DELETE SET NULL` |
| Index partiel | ✅ `vara_rooms_group_id_idx … WHERE group_id IS NOT NULL` |
| `cira_archive_group` | ✅ `delete from public.vara_rooms where group_id = p_group_id` |
| `vara_create_room` | ✅ INSERT persiste `group_id` |

La colonne étant nullable, les rooms existantes restent valides ; la FK
`ON DELETE SET NULL` protège contre une suppression de groupe.

## 6. Rollback

- **Client** : aucun changement client dans ce lot (le support de `group_id` /
  « Démarrer une VARA » depuis une collection était déjà déployé).
- **Base** : en cas de besoin, migration inverse — recréer `cira_archive_group` et
  `vara_create_room` dans leurs versions `20260714200000`/`20260714220000`
  (sans `group_id`) puis `alter table public.vara_rooms drop column group_id;`.
  Point de restauration structurel : le backup off-repo du §3.

## 7. Références

- **Commit :** `a23b83b75f42e162d31192f97d7495920681a9de`
- **Migration :** `supabase/migrations/20260715120000_cira_archive_evicts_group_rooms.sql`
- **Test :** `supabase/tests/20_group_archive.sql`
- **Audit / décision :** `docs/watch-room-audit.md` (ARCHIVE-ROOM-GAP)
