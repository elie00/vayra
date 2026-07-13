# CIRA — PR 1 : compte rendu (base de données + repository client)

**Date** : 2026-07-13
**Branche** : `feat/cira-repository` → mergée dans `main` (merge `30bc47a`), branche supprimée.
**Périmètre** : couche base de données complète du domaine social CIRA et
repository TypeScript côté client. Aucune UI dans cette PR.

## Ce qui a été livré

### 1. Schéma SQL (`supabase/migrations/20260713171654_cira_schema.sql`)

6 tables préfixées `cira_`, liées exclusivement à `auth.users.id` :

| Table | Rôle |
|---|---|
| `public.cira_profiles` | handle unique, display name, avatar, opt-in présence |
| `public.cira_friendships` | demandes/amitiés, index unique sur la paire (anti-doublon bidirectionnel) |
| `public.cira_blocks` | blocages unidirectionnels |
| `public.cira_presence` | sessions de présence avec expiration |
| `public.cira_invitations` | invitations par lien — seul `sha256(code)` est stocké |
| `private.cira_rate_limits` | compteurs de rate limiting (jamais exposée) |

### 2. RLS + helpers privés (`…171655_cira_rls.sql`)

Row-level security sur les 6 tables, plus 9 fonctions `private.*` :
vérification de paire/blocage, `cira_require_uid`/`cira_require_profile`,
verrouillage de paire (anti-race), rate limiting, normalisation et hachage
des codes d'invitation.

### 3. API RPC (`…171656_cira_rpc.sql`)

19 fonctions `security definer` avec `search_path = ''` couvrant :
profil (upsert), demandes d'ami (send/accept/decline/cancel), suppression
d'ami, blocage/déblocage, invitations (create/preview/accept/decline/
revoke/list), listes (relations, blocages), présence (consent/heartbeat/
clear). Les erreurs sont des codes stables (`RATE_LIMITED`,
`ALREADY_RELATED`, `INVITATION_UNAVAILABLE`, …) levés en `P0001`.

### 4. Harnais de test (`scripts/cira/db-test.sh`)

PostgreSQL 15 jetable (initdb dans un tmpdir, socket Unix uniquement,
port 54329), shims Supabase minimaux (`auth.users`, `auth.uid()`, rôles
`anon`/`authenticated`/`service_role`) vivant uniquement dans le harnais,
application des migrations dans l'ordre puis exécution de chaque
`supabase/tests/*.sql` avec `ON_ERROR_STOP=1`. Teardown garanti par trap.

### 5. Tests SQL (`supabase/tests/`, 9 fichiers)

Matrice de menaces multi-utilisateurs : audit structurel, contraintes,
isolation RLS, transitions d'amitié (dont acceptation forcée), blocages
croisés, fuite de présence, invitations (réutilisation de token,
énumération), rate limits, suppression de compte.

### 6. Repository client (`src/lib/cira/`)

- `types.ts` — interface `CiraRepository` (miroir des 19 RPC) et types de domaine.
- `errors.ts` — mapping PostgREST → `CiraError` à code stable ; le message
  est toujours le code seul (aucun token ne peut fuiter dans les erreurs).
- `repository.ts` — implémentation sur le singleton Supabase :
  session vérifiée avant chaque appel, normalisation des codes
  d'invitation identique au SQL, URL d'invitation avec le code dans le
  fragment (`#t=`) jamais en query string, abonnement Realtime privé
  `cira:<userId>` prêt pour l'invalidation (silencieux tant qu'aucun
  trigger serveur n'émet).
- `src/lib/vayra-account.tsx` — export `getVayraSupabaseClient()` pour
  réutiliser le singleton sans créer un second client.

## Vérifications

| Vérification | Résultat |
|---|---|
| Tests SQL (harnais Postgres 15) | 9/9 PASS |
| Tests TypeScript (vitest, repo complet) | 211/211 PASS (dont 58 pour `src/lib/cira`) |
| `tsc -b` | OK |
| `eslint --max-warnings 0` | OK |

## Problèmes rencontrés et corrigés

- Import `CiraError` inutilisé dans `repository.test.ts` (échec `tsc -b`) — supprimé.
- Harnais SQL : sur macOS, un `LC_ALL` invalide fait avorter le postmaster
  (« postmaster became multithreaded during startup »). Corrigé en forçant
  `export LC_ALL=C` dans le script (`e59a6ab`).

## Décisions notables

- **Pas de Supabase CLI ni pgTAP** : non disponibles localement ; un
  Postgres 15 nu + shims de quelques lignes suffit (voir `supabase/README.md`).
- **Migrations défensives** : `CREATE` simple, toute collision échoue
  bruyamment ; procédure de vérification prod documentée dans
  `supabase/README.md` (contrôle des collisions avant, comptages après).
- **Tokens d'invitation** : ~100 bits, jamais stockés ni loggés en clair ;
  le code n'est renvoyé qu'une fois par `cira_create_invitation`.
- **Caveat v1 connu** : une RPC qui échoue par exception annule aussi
  l'incrément de son compteur de rate limit (SQL transactionnel) ; défenses
  primaires : tokens longs et réponses génériques comptées.

## Reste à faire (PR suivantes)

- Triggers serveur émettant sur le canal Realtime `cira:<userId>`
  (le client est prêt).
- Page `/cira/invite` (l'URL est déjà construite côté client — « PR 4 »).
- UI CIRA (listes d'amis, invitations, présence) consommant `CiraRepository`.
- Application des 3 migrations en production (dashboard Supabase → SQL
  Editor, procédure dans `supabase/README.md`).
