# Audit de sécurité de la base — CIRA / VARA

Dernière vérification : 31 août 2026, sur le projet Supabase `kbuwutnzqapwnvzgyjtw`
(région `eu-west-3`). Contrôle mené en lecture seule avant l'ouverture de la bêta
Windows. **Aucune anomalie trouvée.**

## Résultat

| Contrôle | Résultat |
|---|---|
| Tables publiques | 18 |
| Tables sans RLS | **0** |
| Tables avec RLS mais sans politique | 14 — voir ci-dessous, c'est voulu |
| Fonctions `SECURITY DEFINER` | 78 |
| …dont `search_path` verrouillé | **78 / 78** |
| …dont contrôle de l'appelant | 77 / 78 (l'exception est `rls_auto_enable`) |
| Fonctions exécutables par `anon` | **0** |
| Fonctions laissées en ACL par défaut (donc `PUBLIC`) | **0** |

## Pourquoi 14 tables n'ont aucune politique

C'est un choix de conception, pas un oubli. Le frontend n'écrit jamais
directement dans ces tables : `cira/repository.ts` et `vara/repository.ts`
passent par `client.rpc(...)`. Les tables restent donc fermées par défaut, et
seules les fonctions `SECURITY DEFINER` y touchent — chacune vérifiant l'identité
de l'appelant via `private.cira_require_uid()` avant d'agir.

La seule table lue en direct est `cira_profiles`, et elle possède ses politiques.

Ce modèle a l'avantage de concentrer l'autorisation dans un endroit auditable
plutôt que de la disperser dans des politiques par table. Sa contrepartie est que
la sûreté repose entièrement sur les 78 fonctions : une seule qui oublierait
`cira_require_uid()` ouvrirait un accès total. D'où le contrôle ci-dessous, à
rejouer après toute migration.

## Rejouer le contrôle

Avec la CLI Supabase authentifiée sur la machine :

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)   # macOS
PROJECT=kbuwutnzqapwnvzgyjtw

q() {
  curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\":\"$1\"}"
}
```

**Tables sans RLS, ou avec RLS et sans politique :**

```sql
select c.relname,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;
```

**Fonctions à privilèges sans contrôle d'appelant ou sans `search_path` :**

```sql
select p.proname,
       pg_get_functiondef(p.oid) ~ 'require_uid|auth\.uid\(\)' as has_identity,
       pg_get_functiondef(p.oid) ~ 'SET search_path'           as path_locked
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
order by p.proname;
```

**Fonctions exposées à `anon` ou laissées en ACL par défaut :**

```sql
select count(*) filter (where array_to_string(p.proacl, ',') like '%anon=%') as anon_executable,
       count(*) filter (where p.proacl is null)                              as default_acl,
       count(*)                                                              as total
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
```

Les trois requêtes doivent rendre : aucune table sans RLS, `has_identity` et
`path_locked` vrais partout sauf `rls_auto_enable`, et `anon_executable` comme
`default_acl` à zéro.

## Configuration d'authentification

Vérifiée le même jour, également en lecture seule :

- fournisseurs actifs : **Google** et **e-mail** ;
- inscriptions ouvertes, confirmation d'adresse exigée ;
- URL de redirection autorisées : `https://vayra.eybo.tech/auth/callback`,
  `vayra://auth/callback`, `http://127.0.0.1:1420/auth/callback`,
  `http://localhost:1420/auth/callback`.

La présence de `vayra://auth/callback` est ce qui permet au lien reçu par e-mail
de revenir dans l'application installée. Le modèle d'e-mail propose en outre un
code à six chiffres, qui ne dépend d'aucun schéma d'URL et reste donc utilisable
si le navigateur du testeur bloque l'ouverture de l'application.
