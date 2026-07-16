# VAYRA — déploiement GC des rooms expirées via pg_cron

**Produit :** VAYRA — *A product by EYBO*

**Date :** 16 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra`

**Commit déployé :** `65bdc882bf117b0a545ea88a7ff32b1df2207dd9` (`main`)

**Projet Supabase :** `kbuwutnzqapwnvzgyjtw`

**Verdict :** DÉPLOYÉ EN BÊTA PRIVÉE.

## 1. Migration déployée

| Ordre | Fichier | SHA-256 |
| --- | --- | --- |
| 1 | `20260716090000_vara_gc_expired_rooms_cron.sql` | `7e408fc7a1c1eafa8abbfc305b8e7362933c6ac2f1cb851a987b7c99eb8c0020` |

Cette migration **déporte le garbage-collector des rooms expirées hors du chemin
de lecture**. Auparavant `vara_list_rooms` exécutait
`delete from vara_rooms where status='active' and expires_at <= now()` à **chaque
appel authentifié** — un GC greffé sur une lecture chaude, couplant la latence de
liste au volume d'expiration et en contention avec les verrous `FOR UPDATE`
par-room. Le `SELECT` filtrant déjà `expires_at > now()`, le `delete` ne changeait
jamais le résultat : c'était purement du GC.

Changements :

- `vara_list_rooms` recréé **sans** le `delete` inline (chemin de lecture pur,
  signature inchangée → grants conservés).
- `private.vara_gc_expired_rooms()` : fonction de GC dédiée (schéma privé,
  `security definer`, `search_path` épinglé, révoquée de `public/anon/authenticated`),
  qui supprime les rooms actives expirées et renvoie le nombre supprimé.
- Planification **toutes les 5 minutes** via `cron.schedule` (pg_cron), appelant
  `select private.vara_gc_expired_rooms();`.

### Garde de portabilité

La planification est **conditionnée** à la présence de `pg_cron`
(`pg_available_extensions`) et enveloppée dans un bloc `exception … non-fatal` :
sur un environnement sans l'extension (le harness de test local), la fonction est
tout de même créée et le job simplement omis, sans faire échouer la migration.

## 2. Prévol

- `supabase migration list --linked` : toutes les migrations antérieures
  synchronisées ; `20260716090000` était la **seule** absente (`remote` vide).
- Working tree propre.
- Harness SQL local (`scripts/cira/db-test.sh`) : **23/23** passants, dont un test
  ajouté à `16_vara_rooms.sql` : une room expirée n'est **ni retournée ni
  supprimée** par `vara_list_rooms`, et `private.vara_gc_expired_rooms()` la
  moissonne bien.

## 3. Sauvegarde

- Dump structurel du schéma distant **avant** application, hors dépôt, permissions
  utilisateur uniquement (`chmod 600`), 197 Ko.
- Aucune URL, aucun token, aucune donnée utilisateur.

## 4. Dry-run et application

- `supabase db push --linked --dry-run` : confirme une **seule** migration
  (`20260716090000_vara_gc_expired_rooms_cron.sql`).
- `supabase db push --linked` : appliquée en transaction unique, enregistrement
  automatique dans `supabase_migrations.schema_migrations`.

## 5. Audit post-déploiement (non destructif)

Dump distant frais + une **requête de lecture** ciblée sur `cron.job` (la
planification étant non-fatale, il fallait confirmer que le job existe vraiment,
pas seulement que l'extension est présente) :

| Contrôle | Résultat |
| --- | --- |
| Migration `20260716090000` enregistrée | ✅ `remote = 20260716090000` |
| `vara_list_rooms` — `delete` inline retiré | ✅ 0 occurrence de `delete from vara_rooms` |
| `private.vara_gc_expired_rooms()` | ✅ présente, `OWNER postgres`, révoquée de PUBLIC |
| Extension `pg_cron` | ✅ créée |
| Job `vara-gc-expired-rooms` | ✅ **actif**, `schedule = */5 * * * *`, `command = select private.vara_gc_expired_rooms();` |

Aucune donnée n'a été mutée au-delà de la migration : la fonction GC n'a **pas**
été déclenchée manuellement — le cron s'en charge toutes les 5 minutes.

## 6. Rollback

- **Base** : `select cron.unschedule('vara-gc-expired-rooms');` pour arrêter le
  job, puis recréer `vara_list_rooms` dans sa version `20260713290000` (avec le
  `delete` inline) si l'on souhaite revenir au GC sur le chemin de lecture ;
  `drop function private.vara_gc_expired_rooms();` optionnel. Point de restauration
  structurel : le backup off-repo du §3.
- **Client** : aucun changement client dans ce lot (interface `vara_list_rooms`
  inchangée).

## 7. Références

- **Commit :** `65bdc882bf117b0a545ea88a7ff32b1df2207dd9`
- **Migration :** `supabase/migrations/20260716090000_vara_gc_expired_rooms_cron.sql`
- **Test :** `supabase/tests/16_vara_rooms.sql`
