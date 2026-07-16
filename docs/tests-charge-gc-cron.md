# VAYRA — tests de charge du GC des rooms expirées (pg_cron)

**Produit :** VAYRA — *A product by EYBO*

**Date :** 16 juillet 2026 (UTC)

**Dépôt :** `elie00/vayra` · **Commit :** `914e0d3f2f40d77f01d564a9a4d2b5c02c122d66`

**Cible :** `private.vara_gc_expired_rooms()`, planifié toutes les 5 min via pg_cron
(migration `20260716090000`, cf. `deploiement-vara-gc-cron.md`).

**Verdict :** ✅ PASS — GC piloté par l'index, rapide, sans contention avec les lectures.

## 1. Objectif

Le GC des rooms expirées a été déporté du chemin de lecture (`vara_list_rooms`) vers
un job pg_cron. Ce test de charge valide les deux propriétés qui justifiaient ce
déport :

1. **Passage à l'échelle** — le GC doit rester bon marché quand la table `vara_rooms`
   grandit, en s'appuyant sur l'index partiel `vara_rooms_expiry_idx`
   (`(expires_at) where status = 'active'`) plutôt qu'en balayant toute la table.
2. **Non-contention** — le GC ne doit **pas** bloquer les lectures concurrentes
   (`vara_list_rooms`), ce qui était le défaut du GC sur le chemin de lecture.

## 2. Outil

`scripts/cira/db-loadtest-gc.sh` — harness **opt-in**, **non** lancé par
`scripts/cira/db-test.sh` (il seed 100 000+ lignes ; la suite 23/23 reste rapide). Il
bootstrappe son propre cluster PostgreSQL jetable (même schéma de shims que le harness
principal), applique les migrations, seed la volumétrie, puis mesure.

Volumétrie paramétrable :

```bash
bash scripts/cira/db-loadtest-gc.sh
LIVE=200000 EXPIRED=2000 BACKLOG=80000 bash scripts/cira/db-loadtest-gc.sh
```

- `LIVE` — rooms vivantes (jamais collectées) — défaut 100 000
- `EXPIRED` — petite fraction expirée (accumulation entre deux passages du cron) — défaut 1 000
- `BACKLOG` — gros arriéré expiré (cron indisponible un moment) — défaut 40 000

## 3. Scénarios et méthode

### Phase 1 — régime permanent (plan + temps)
Grosse table majoritairement vivante + **petite** fraction expirée = ce qui s'accumule
entre deux exécutions du cron (5 min). On mesure d'abord le plan du `DELETE` via
`EXPLAIN (ANALYZE, BUFFERS)` dans une transaction **annulée** (les lignes restent pour
la mesure suivante), puis on exécute la vraie fonction GC chronométrée.

Assertions : le plan **utilise `vara_rooms_expiry_idx`** et **ne contient aucun
`Seq Scan on vara_rooms`** ; le GC supprime exactement `EXPIRED` lignes ; il reste
exactement `LIVE` rooms et **0 membre orphelin** (cascade `vara_room_members`).

### Phase 2 — arriéré + non-contention
Un **gros** arriéré (`BACKLOG`) est supprimé à l'intérieur d'une transaction qui **retient
ses verrous** (`begin; select private.vara_gc_expired_rooms(); select pg_sleep(1.5);
commit;`). En parallèle, un **autre** utilisateur (membre de seulement 3 rooms vivantes)
exécute `vara_list_rooms`. On chronomètre cette lecture.

Assertion : la lecture revient en **< 1200 ms** (elle ne peut donc pas avoir été bloquée
par le `pg_sleep(1.5)` du GC). Fondement : le `DELETE` prend un `RowExclusiveLock` sur la
table (compatible avec l'`AccessShareLock` d'un `SELECT`) et des verrous de ligne sur les
rooms **expirées** — disjointes des rooms **vivantes** que lit le lecteur.

## 4. Résultats (exécution de référence : LIVE=100000, EXPIRED=1000, BACKLOG=40000)

### Phase 1 — régime permanent (1000 expirées sur 101000)

```
Index Scan using vara_rooms_expiry_idx on vara_rooms
  (cost=0.29..380.62 rows=946) (actual time=0.013..0.184 rows=1000 loops=1)
Planning Time: 0.544 ms
Execution Time: 14.311 ms
```

| Mesure | Valeur |
| --- | --- |
| Plan du `DELETE` | **Index Scan** sur `vara_rooms_expiry_idx` — aucun seq scan |
| Temps d'exécution du plan | ~14,3 ms |
| Temps de la fonction `vara_gc_expired_rooms()` | ~13,8 ms |
| Lignes supprimées | 1000 (exactement l'attendu) |
| Rooms vivantes restantes | 100000 |
| Membres orphelins après cascade | 0 |

### Phase 2 — non-contention (arriéré de 40000)

| Mesure | Valeur |
| --- | --- |
| Rooms rendues par le lecteur | 3 |
| Latence de `vara_list_rooms` pendant le GC | **52 ms** (< 1200 ms → non bloqué) |

## 5. Interprétation

- Le GC **ne dégrade pas** quand la table grandit : à 100 000 rooms vivantes, il ne
  touche que la petite fraction expirée via l'index partiel (~14 ms), au lieu de balayer
  100 000+ lignes à chaque exécution. C'est exactement le gain visé par le déport hors du
  chemin de lecture.
- Le GC **n'interfère pas** avec les lectures : même un arriéré de 40 000 suppressions
  retenant ses verrous laisse une lecture concurrente répondre en ~50 ms.
- Cas limite documenté : si l'arriéré expiré devient une **grande** fraction de la table
  (ex. cron arrêté longtemps), le planificateur peut légitimement basculer sur un seq scan
  — c'est le choix correct pour supprimer la majorité des lignes. Le cron toutes les 5 min
  maintient l'arriéré petit, donc le régime permanent (index) est le cas nominal.

## 6. Notes de mise au point (corrigées dans l'outil)

- `test.login` du harness utilise `set_config(..., true)` **transaction-local** : le
  lecteur devait donc être exécuté dans un unique `begin; … commit;`, sinon l'autocommit
  perdait l'identité authentifiée entre `test.login` et `vara_list_rooms`
  (`NOT_AUTHENTICATED`).
- macOS `date` n'a pas `%N` : l'horodatage milliseconde passe par `python3`.

## 7. Références

- **Outil :** `scripts/cira/db-loadtest-gc.sh`
- **Cible :** `private.vara_gc_expired_rooms()` — migration
  `supabase/migrations/20260716090000_vara_gc_expired_rooms_cron.sql`
- **Déploiement :** `docs/deploiement-vara-gc-cron.md`
