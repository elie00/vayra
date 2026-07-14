# VAYRA — déploiement VARA Collections v2 en base

**Produit :** VAYRA — *A product by EYBO*

**Date :** 14 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra`

**Commit déployé :** `f601b3144468e201d6178ebca3a72179218d2707` (`main`, descendant de `3331826`)

**Projet Supabase :** `kbuwutnzqapwnvzgyjtw`

**Verdict :** DÉPLOYÉ EN BÊTA PRIVÉE.

## 1. Migration déployée

| Ordre | Fichier | SHA-256 |
| --- | --- | --- |
| 1 | `20260714220000_vara_collections_v2.sql` | `d9166bf298f9371fb866eb83b4b21ff34c93bacb420264655290eff58cb2acdb` |

Cette migration fait évoluer VARA Collections d'un booléen `members_can_edit`
vers une **politique d'édition par collection** à trois niveaux, et ajoute la
**délégation** de l'administration d'une collection à un membre :

- Colonne `member_policy text` (`reader` / `contributor` / `collaborator`) avec
  contrainte CHECK ; backfill `members_can_edit = true → contributor`.
- `members_can_edit` redevient une colonne **générée** :
  `generated always as (member_policy <> 'reader') stored` — compatibilité
  ascendante conservée pour les clients existants.
- Table `vara_collection_delegates (collection_id, user_id, granted_by,
  granted_at)`.
- Helpers `private.vara_collection_can_manage` (owner/admin **ou** délégué
  encore membre) et `private.vara_collection_edit_level` (`full` / `own` /
  `none`).
- RPC `vara_set_collection_policy`, `vara_add/remove/list_collection_delegate`.
- Recréation de `vara_collection_json`, `vara_update_collection`,
  `vara_create_collection`, `vara_move/remove_collection_item` pour honorer la
  politique et l'échelon d'édition.
- Trigger `vara_tg_purge_delegates_on_member_removal` : la délégation cesse
  automatiquement quand le membre quitte le groupe / est retiré / bloqué.

### Durcissements intégrés avant déploiement (revue adversariale)

Une revue adversariale multi-agents (4 dimensions × vérification) a été passée
avant le déploiement : **0 faille HIGH, aucune faille SQL / sécurité /
escalade / concurrence / fuite**. Deux blocages frontend confirmés (medium) ont
été corrigés et sont inclus dans le commit déployé :

1. **Gating par item** — la comparaison `item.addedBy?.userId === me?.userId`
   valait `undefined === undefined → true` pendant la fenêtre de chargement du
   profil sur un item orphelin ; contrôles Move/Remove affichés à tort.
   Corrigé par gardes `me != null && item.addedBy != null`.
2. **Création `collaborator` non-atomique** — la création faisait
   `createCollection` puis `setCollectionPolicy` ; un échec du second appel
   laissait une collection persistée en `contributor` + doublon au réessai.
   Corrigé côté SQL : `vara_create_collection` reçoit un paramètre
   `p_member_policy` optionnel et pose l'un des trois niveaux **en un seul
   appel**. La surcharge 4-args a été **droppée** (sinon `create or replace`
   l'aurait laissée en overload, insérant encore dans la colonne désormais
   générée), et l'ACL d'exécution réappliquée sur la nouvelle signature.

## 2. Prévol

- Historique distant vérifié via `supabase migration list --linked` : toutes
  les migrations antérieures présentes et synchronisées ;
  `20260714220000_vara_collections_v2.sql` était la **seule** absente (`remote`
  vide), dans le bon ordre timestamp.
- Working tree propre au moment du déploiement.
- Harness SQL local (`scripts/cira/db-test.sh`) : **23/23** fichiers de tests
  passants sur le jeu de migrations identique, incluant les nouvelles
  assertions de création atomique et de rejet de politique invalide.

## 3. Sauvegarde

- Dump structurel du schéma distant **avant** application, hors dépôt,
  permissions utilisateur uniquement (`chmod 600`), 188 Ko.
- Sert de point de restauration précis (définitions de fonctions et de la table
  `vara_collections` avant recréation).
- Aucune URL, aucun token, aucune donnée utilisateur n'y figure.

## 4. Dry-run et application

- `supabase db push --linked --dry-run` : confirme qu'une **seule** migration
  serait poussée (`20260714220000_vara_collections_v2.sql`).
- `supabase db push --linked` : appliquée en transaction unique, enregistrement
  dans `supabase_migrations.schema_migrations` automatique.
- Un timeout réseau transitoire (route IPv6 vers `api.supabase.com`) est survenu
  au premier dry-run ; réessai immédiat concluant. Aucun effet sur la base.

## 5. Audit post-déploiement (non destructif)

Réalisé par `supabase migration list --linked` puis dump distant frais et
inspection du schéma déployé :

| Contrôle | Résultat |
| --- | --- |
| Migration `20260714220000` enregistrée à distance | ✅ `remote = 20260714220000` |
| Colonne `member_policy` + CHECK (reader/contributor/collaborator) | ✅ |
| `members_can_edit` = `GENERATED ALWAYS AS (member_policy <> 'reader') STORED` | ✅ |
| `vara_create_collection` — signature unique 5-args | ✅ aucune orpheline 4-args |
| ACL de la nouvelle fonction | ✅ `REVOKE FROM PUBLIC` + `GRANT TO authenticated` (anon exclu) |
| Table `vara_collection_delegates` | ✅ présente |

La recette transactionnelle live (temp table + ROLLBACK) des déploiements
précédents nécessitait un canal SQL direct (mot de passe DB / ports PG 5432·6543)
non configuré dans cet environnement. L'équivalence fonctionnelle est couverte
par le harness local 23/23 sur le jeu de migrations identique et par l'audit du
schéma effectivement déployé.

## 6. Confidentialité et périmètre

- La migration n'expose que des références publiques de catalogue et des
  métadonnées de collection ; jamais de source, flux, addon, info-hash,
  progression, bibliothèque, IP, appareil ni session Stremio.
- La délégation ne crée **aucun** nouveau graphe social : un délégué doit rester
  membre du groupe, ne peut pas se re-déléguer ni déléguer à un non-membre, et
  perd ses droits dès qu'il quitte / est retiré / bloqué.
- Les RPC de politique et de délégation sont `security definer`, `search_path`
  épinglé, révoquées de `public`/`anon`, accordées à `authenticated`.

## 7. Références

- **Commit :** `f601b3144468e201d6178ebca3a72179218d2707`
- **Migration :** `supabase/migrations/20260714220000_vara_collections_v2.sql`
- **Tests SQL :** `supabase/tests/22_collection_policy_delegate.sql`
- **Client :** `src/lib/vara/{types,repository,errors}.ts`,
  `src/views/settings/cira-collections.tsx`
