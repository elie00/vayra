# VAYRA — déploiement VARA Collections en base

**Produit :** VAYRA — *A product by EYBO*

**Date :** 14 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra`

**Commit déployé :** `f57347513d7400efdec03bfda4834f82c8f208cd` (descendant de `5dc5205`)

**Verdict :** DÉPLOYÉ EN BÊTA PRIVÉE.

## 1. Migrations déployées

| Ordre | Fichier | SHA-256 |
| --- | --- | --- |
| 1 | `20260714100000_cira_groups_authz_hardening.sql` | `7f8bc788831843dd4325e62bbdbad382ae6d7acc29f99d2b46bba936df1bf3b7` |
| 2 | `20260714120000_vara_collections.sql` | `6e2351a899847dd24900d0967479f13bd0388eef2a150e97f804169f1131734d` |

La première corrige un contournement préexistant des autorisations de groupe
lorsque le rôle SQL est NULL. La seconde crée VARA Collections.

## 2. Prévol

- Historique distant vérifié : toutes les migrations antérieures (CIRA de base,
  VARA distante, CIRA Discover) présentes ; les deux migrations cibles étaient
  les **seules** manquantes, dans le bon ordre timestamp.
- Working tree propre au moment du déploiement.

## 3. Sauvegarde

- Emplacement hors dépôt, permissions utilisateur uniquement (`600`) :
  `~/.codex/backups/vayra/2026-07-14-pre-collections/`.
- Contenu : dump structurel du schéma public, définitions des 9 fonctions de
  groupe **avant** recréation (rollback précis), définitions des fonctions du
  schéma `private`, manifeste horodaté UTC et `SHA256SUMS`.
- SHA-256 du fichier `SHA256SUMS` : `e24f8ce8eab7e81fd42365e687cae6efa6eaa82c50a7f92272efbcb75ec1826c`.
- Aucune URL, aucun token, aucune donnée utilisateur n'est incluse.

## 4. Dry-run et application

- Dry-run : les deux migrations exécutées dans une transaction `BEGIN … ROLLBACK`
  sur la base réelle, sans persistance ; les deux tables apparaissent dans la
  transaction puis sont annulées, résidu nul.
- Application : les deux migrations appliquées dans **une transaction unique**,
  dans l'ordre, via le canal officiel Supabase Management API.
- Historique : versions `20260714100000` et `20260714120000` enregistrées dans
  `supabase_migrations.schema_migrations` et confirmées par `supabase migration
  list` (colonne distante renseignée).

## 5. Audit post-migration

| Contrôle | Résultat |
| --- | --- |
| Tables `vara_collections` et `vara_collection_items` | présentes (2/2) |
| RLS activée | oui (2/2) |
| Policies permissives imprévues | aucune (0) |
| Accès direct `anon` / `authenticated` aux tables | refusé |
| RPC Collections publiques | 9, toutes `security definer` |
| `search_path` verrouillé (vide) sur les fonctions Collections | 14/14 |
| Garde d'identité `vara_require_uid` sur les RPC Collections | 9/9 |
| RPC accordées à `authenticated` seul, aucune à `anon` | conforme |
| Fonctions `private` sans droit API | conforme |
| RPC de groupe corrigées en version null-safe | 9/9 |
| Trigger Realtime `vara_collections_notify` (payload vide, membres) | présent |
| Contraintes `check` (meta_id, poster HTTPS/TLD, media_type, saison/épisode, titre, nom, description) | 13 présentes |
| Unicité position différée, index de dédoublonnage d'item | présents |

Les plafonds 50 collections/groupe et 500 items/collection sont appliqués côté
RPC et vérifiés par la recette (§6). Aucun objet lié au lecteur, au cast, à
LUMA, à Stremio, au P2P ou au contenu n'a été modifié : les migrations ne
créent que les deux tables et ne recréent que les neuf fonctions de groupe et
les fonctions Collections associées.

## 6. Recette distante minimale

Exécutée dans une transaction systématiquement annulée : quatre comptes
synthétiques explicitement bêta, un groupe (owner/admin/member), collections et
items. **23 contrôles, tous verts** :

- droits par rôle : refus de création par un membre, création owner/admin ;
- ajout, déplacement (rang dense) et retrait d'items ;
- option `members_can_edit` : ajout et retrait de ses propres items par un
  membre, refus de retrait d'un item d'autrui et de suppression de la collection ;
- doublon rejeté ; plafonds 500 items et 50 collections atteints ;
- refus des posters `http`, `localhost`, IP littérale, **IP hexadécimale**
  (`0x7f.0.0.1`) et userinfo ;
- refus de lecture par un non-membre ;
- un compte à rôle NULL ne peut ni modifier, ni supprimer, ni créer de lien sur
  un groupe dont il n'est pas membre ; le groupe reste intact ;
- un blocage retire immédiatement le membre du groupe et lui fait perdre l'accès
  à la collection.

Rollback intégral confirmé : aucun compte synthétique, profil, groupe,
collection ou item résiduel ; les tables Collections restent vides en base.

## 7. Risques restants

- Le déploiement a été effectué via l'endpoint SQL de la Management API (les
  ports PostgreSQL directs restent inaccessibles depuis le poste). L'entrée
  `schema_migrations` porte une note de source plutôt que le détail des
  statements ; la comparaison d'historique se fait sur la version et reste
  correcte.
- La recette d'interface end-to-end (bouton fiche média, menu, actions) reste à
  réaliser manuellement avec deux comptes bêta connectés.
- La bêta doit rester limitée aux comptes explicitement autorisés (`cira_beta`),
  qui doivent rafraîchir leur JWT et choisir un handle CIRA.

## 8. Verdict

**DÉPLOYÉ EN BÊTA PRIVÉE.** Les deux migrations sont appliquées, enregistrées et
auditées ; la recette transactionnelle est intégralement verte et sans résidu.
Aucune ouverture de bêta ni recette d'interface n'est engagée : en attente
d'accord explicite.
