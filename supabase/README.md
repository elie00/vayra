# CIRA — base de données

CIRA est le domaine social privacy-first de VAYRA, entièrement autonome et lié
exclusivement à `auth.users.id`. Ce dossier contient :

- `migrations/` — 11 migrations ordonnées : relations, profils, présence,
  invitations, RLS/RPC/Realtime, puis groupes privés, rôles, invitations de
  groupe, frontière de blocage, boîte sociale dérivée et pagination bornée.
- `tests/` — tests SQL multi-utilisateurs couvrant la matrice de menaces
  (RLS, acceptation forcée, énumération de handles, réutilisation de token,
  rôles et propriété de groupe, blocage inter-groupes, fuite de présence,
  avatar traçant, suppression de compte, injection/XSS, rate limits et pages
  non bornées).
- `../scripts/cira/db-test.sh` — harnais de test local.

## Lancer les tests

```bash
bash scripts/cira/db-test.sh
```

Prérequis : PostgreSQL 15 ou plus récent (`brew install postgresql@15`). Le
harnais utilise d'abord `pg_config --bindir`, puis le chemin Homebrew, et reste
surchargeable via `PGBIN=…`.

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

## Pourquoi PostgreSQL nu pour les tests ?

- Le schéma ne dépend de Supabase que via `auth.users`, `auth.uid()` et les
  primitives Realtime, shimées uniquement par le harnais. Un PostgreSQL 15+
  jetable suffit donc pour les régressions SQL et évite de dépendre de Docker.
- **pgTAP / pg_prove** : extension et outillage non disponibles localement.
  Les blocs `DO` + `ON_ERROR_STOP` fournissent la même valeur (assertion =
  exception) sans dépendance supplémentaire.

La même suite est obligatoire dans GitHub Actions via
`.github/workflows/cira-db.yml` dès qu'une migration, un test SQL ou le harnais
change.

## Déploiement en bêta privée

Le SQL Editor n'est pas la procédure de déploiement : il ne produit pas
d'historique reproductible. Utiliser la Supabase CLI liée au projet cible. Ne
jamais committer l'access token, le mot de passe PostgreSQL, une service-role
key, un dump ou le contenu de `supabase/.temp/`.

### 1. Préconditions et sauvegarde

1. Partir de `main` propre, après succès des contrôles GitHub Actions frontend
   et `cira-db`.
2. Installer la Supabase CLI, s'authentifier localement puis lier explicitement
   le projet :

   ```bash
   supabase login
   supabase link --project-ref "$SUPABASE_PROJECT_REF"
   supabase migration list --linked
   ```

   `supabase/config.toml` initialise le projet CLI sans identifiant distant;
   `supabase/.temp/`, créé par `link`, est ignoré par Git.

3. Vérifier dans **Database → Backups** qu'un point de restauration antérieur
   au déploiement est disponible. Sur un projet sans sauvegarde récupérable,
   créer en plus des dumps logiques hors du dépôt, depuis une connexion obtenue
   dans le panneau **Connect** :

   ```bash
   BACKUP_DIR="$HOME/vayra-backups/cira-$(date -u +%Y%m%dT%H%M%SZ)"
   install -d -m 700 "$BACKUP_DIR"
   supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/roles.sql" --role-only
   supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/schema.sql"
   supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/data.sql" --use-copy --data-only \
     -x storage.buckets_vectors -x storage.vector_indexes
   ```

   Le répertoire doit rester mode `0700`; les fichiers doivent être non vides.
   Une sauvegarde non vérifiée n'autorise pas le déploiement.

### 2. Inventaire et dry-run

Les migrations initiales sont défensives : objets préfixés `cira_` et schéma
`private`; une collision provoque une erreur au lieu d'écraser un objet. Avant
le premier déploiement, exécuter cette requête en lecture seule :

```sql
select n.nspname, c.relname as object_name, 'relation' as object_type
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname like 'cira\_%'
union all
select n.nspname, p.proname, 'function'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname like 'cira\_%';
```

Pour une installation neuve, le résultat doit être vide. Sinon, arrêter et
réconcilier l'inventaire avec `supabase migration list --linked`; ne jamais
utiliser `migration repair` pour masquer une migration non appliquée.

Le dry-run doit annoncer exactement les onze timestamps `20260713…`, dans
l'ordre, et aucune autre migration :

```bash
supabase db push --linked --dry-run
```

### 3. Application et contrôle

Appliquer uniquement après validation de la sauvegarde et du dry-run :

```bash
supabase db push --linked
supabase migration list --linked
```

Puis exécuter le contrôle post-application :

```sql
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname like 'cira\_%' and c.relkind = 'r' and c.relrowsecurity; -- 12

select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'cira\_%' and p.prosecdef; -- 42

select count(*) from pg_trigger
where tgname like 'cira\_%' and not tgisinternal; -- 14

select count(*) from pg_policies
where schemaname = 'realtime' and policyname = 'cira_receive_own_channel'; -- 1
```

Une divergence est un échec de déploiement. Ne pas activer de comptes bêta
avant d'avoir expliqué la divergence ou restauré le point pré-déploiement.

### 4. Accès bêta et recette à deux comptes

CIRA est fermé côté serveur par `auth.users.raw_app_meta_data.cira_beta`. La
clé doit être ajoutée via l'API Admin Supabase ou l'éditeur utilisateur du
Dashboard, jamais depuis le client et jamais via `user_metadata`. Après le
changement, les deux comptes doivent se déconnecter/reconnecter afin d'obtenir
un JWT actualisé.

N'autoriser que deux comptes de recette, puis vérifier successivement : profil
et handle, demande/refus/annulation/acceptation/suppression, invitation courte,
blocage croisé, groupe/rôles/transfert de propriété, présence opt-in et TTL,
pages HTTPS et deep links. Confirmer séparément que la session Stremio et
VARA/VEYA sont inchangées. Élargir la bêta seulement après cette recette.

Notes :

- `service_role` n'est volontairement pas touché (plan admin, bypass RLS).
- Les tokens d'invitation ne sont jamais stockés ni loggés : seul
  `sha256(code normalisé)` est conservé ; le code clair n'est renvoyé qu'une
  seule fois par `cira_create_invitation`.
- Les échecs de preview/acceptation/refus d'un token retournent une erreur
  métier dans le résultat plutôt qu'une exception PostgreSQL : le compteur de
  tentative est ainsi committé. Les tokens restent opaques (100 bits), hashés
  au repos et retirés de la barre d'adresse dès leur lecture.
- Il n'existe aucune recherche ou liste publique de handles. Une demande par
  handle exact crée un reçu aveugle identique pour une cible réelle, inconnue,
  personnelle ou bloquée. Le demandeur ne reçoit ni profil, ni identifiant, ni
  ligne pending brute, ni signal Realtime distinct avant acceptation explicite.
  La table de liaison des reçus n'est jamais lisible par les rôles API.
