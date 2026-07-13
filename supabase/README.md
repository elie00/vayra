# CIRA — base de données

CIRA est le domaine social privacy-first de VAYRA, entièrement autonome et lié
exclusivement à `auth.users.id`. Ce dossier contient :

- `migrations/` — 4 migrations ordonnées : schéma + contraintes + index, RLS +
  helpers privés, les RPC (`security definer`, `search_path = ''`), puis les
  triggers Realtime (pings `changed` vides sur le canal privé `cira:<userId>`
  + policy de réception sur `realtime.messages`).
- `tests/` — tests SQL multi-utilisateurs couvrant la matrice de menaces
  (RLS, acceptation forcée, énumération de handles, réutilisation de token,
  blocage croisé, fuite de présence, avatar traçant, suppression de compte,
  injection/XSS, rate limits).
- `../scripts/cira/db-test.sh` — harnais de test local.

## Lancer les tests

```bash
bash scripts/cira/db-test.sh
```

Prérequis : PostgreSQL 15 (`brew install postgresql@15`, binaires attendus
dans `/opt/homebrew/opt/postgresql@15/bin`, surchargeable via `PGBIN=…`).

Le harnais :

1. crée une instance PostgreSQL 15 **jetable** (`initdb` dans un dossier
   `mktemp` sous `/tmp` — chemin court exigé par la socket Unix — port dédié
   `54329`, aucune écoute TCP) ;
2. crée les **shims Supabase** (schéma `auth`, table `auth.users` minimale,
   `auth.uid()` lisant `request.jwt.claims`, rôles
   `anon`/`authenticated`/`service_role`, helpers `test.login()/logout()`,
   et un shim `realtime` minimal — `realtime.send()` insère dans
   `realtime.messages`, `realtime.topic()` lit un GUC de test). Ces shims
   vivent uniquement dans le harnais, **jamais** dans les migrations ;
3. applique les migrations dans l'ordre (chacune dans une transaction) ;
4. exécute chaque `supabase/tests/*.sql` via `psql -v ON_ERROR_STOP=1` et
   affiche `PASS`/`FAIL` par fichier (code retour non nul si échec) ;
5. démonte tout (trap : `pg_ctl stop` + suppression du dossier), même en cas
   d'échec.

Les utilisateurs sont simulés par
`set_config('role', 'authenticated', true)` +
`set_config('request.jwt.claims', '{"sub":"<uuid>", …}', true)`. Les
assertions d'échec attendu utilisent des blocs `DO` avec `BEGIN/EXCEPTION`
qui échouent si l'erreur attendue ne se produit **pas**.

## Pourquoi pas Supabase CLI ni pgTAP ?

- **Supabase CLI** : non installée dans l'environnement, et le dépôt n'a ni
  `config.toml` ni stack Supabase locale (Docker). Le schéma ne dépend de
  Supabase que via `auth.users` et `auth.uid()`, tous deux shimés en
  quelques lignes : un PostgreSQL 15 nu suffit et reste beaucoup plus rapide.
- **pgTAP / pg_prove** : extension et outillage non disponibles localement.
  Les blocs `DO` + `ON_ERROR_STOP` fournissent la même valeur (assertion =
  exception) sans dépendance supplémentaire.

## Application en production (dashboard Supabase → SQL Editor)

Aucun inventaire prod n'est possible avec la clé publiable, donc les
migrations sont défensives : uniquement des objets préfixés `cira_` (+
`create schema if not exists private`), en `CREATE` simple — **toute
collision échoue bruyamment au lieu d'écraser quoi que ce soit**.

1. **Vérifier manuellement les collisions d'abord** — dans le SQL Editor :

   ```sql
   select n.nspname, c.relname as objet, 'table/index' as type
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relname like 'cira\_%'
   union all
   select n.nspname, p.proname, 'fonction'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname like 'cira\_%';
   ```

   Le résultat doit être **vide**. Sinon, ne rien appliquer et investiguer.

2. Appliquer les 4 migrations **dans l'ordre des timestamps**, une par une,
   chacune collée intégralement dans le SQL Editor (chaque exécution du SQL
   Editor est transactionnelle : une erreur annule le fichier en cours).

3. Vérification rapide post-application :

   ```sql
   -- 6 tables avec RLS, 19 RPC security definer
   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relname like 'cira\_%' and c.relkind = 'r' and c.relrowsecurity; -- = 6
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'cira\_%' and p.prosecdef;  -- = 19
   -- 7 triggers de notification realtime, 1 policy de réception
   select count(*) from pg_trigger where tgname like 'cira\_%';              -- = 7
   select count(*) from pg_policies
   where schemaname = 'realtime' and policyname = 'cira_receive_own_channel'; -- = 1
   ```

Notes :

- `service_role` n'est volontairement pas touché (plan admin, bypass RLS).
- Les tokens d'invitation ne sont jamais stockés ni loggés : seul
  `sha256(code normalisé)` est conservé ; le code clair n'est renvoyé qu'une
  seule fois par `cira_create_invitation`.
- Caveat v1 connu (SQL transactionnel, pas d'Edge Function) : une RPC qui
  échoue par exception annule aussi l'incrément de son compteur de rate
  limit ; seuls les appels non-erronés sont comptés. Défenses primaires :
  tokens à 100 bits et réponses génériques (comptées) de
  `cira_send_request`.
