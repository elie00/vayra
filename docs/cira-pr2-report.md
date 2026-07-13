# CIRA — PR 2 : compte rendu (Realtime + page d'invitation + UI)

**Date** : 2026-07-13
**Branche** : `main` (commits directs, micro-commits poussés au fil de l'eau).
**Périmètre** : les 4 points « Reste à faire » du rapport PR 1 —
triggers Realtime, page web `/cira/invite`, UI CIRA in-app, et préparation
de l'application en production.

## 1. Triggers Realtime (`supabase/migrations/20260713200000_cira_realtime.sql`)

Le serveur émet désormais des pings `changed` (payload vide — pur signal
d'invalidation, aucune donnée ne transite) sur le canal privé
`cira:<userId>` que le client écoutait déjà :

| Événement | Destinataires |
|---|---|
| Amitié (insert/update/delete) | les deux membres de la paire |
| Profil (champs visibles ou consentement présence) | soi + amis acceptés |
| Présence (insert/delete, update **si l'état change**) | amis acceptés, **uniquement sous consentement** |
| Invitation (insert/update) | le créateur seul (le token ne transite jamais) |
| Blocage (insert/delete) | le bloqueur seul |

Garde-fous : `private.cira_notify` avale toute erreur `realtime.send`
(une panne Realtime ne casse jamais l'écriture) ; les heartbeats qui ne font
que rafraîchir la TTL restent silencieux (clause `WHEN`) ; la purge de
présence à l'opt-out ne ping pas (le profil, déjà passé à `false`, est
re-vérifié dans le trigger). La réception est autorisée par une policy
`SELECT` sur `realtime.messages` limitée au topic `cira:<uid>` de l'appelant.

Harnais : shim `realtime` minimal (`realtime.send` → insertion dans
`realtime.messages`, `realtime.topic()` → GUC de test). Test
`supabase/tests/09_realtime.sql` : destinataires exacts par scénario, forme
des messages, silence des heartbeats TTL, consentement, et la policy
(un utilisateur ne lit que son propre topic, anon ne lit rien).

## 2. Page web (`site/public/cira/invite.html`)

Servie sur `https://vayra.eybo.tech/cira/invite` (cleanUrls Vercel).
Statique, **aucun appel réseau** : `cira_preview_invitation` étant réservé
aux utilisateurs authentifiés, la page se contente de lire le code dans le
fragment (`#t=`, jamais envoyé au serveur), de le normaliser comme l'app,
puis de le remettre à l'application via `vayra://cira/invite#t=<code>`
(bouton « Ouvrir dans VAYRA », copie du code et lien de téléchargement en
secours). État « lien incomplet » si le fragment manque. Vérifiée au
navigateur (rendu, normalisation du code, href du deep link, les deux états).

## 3. UI in-app

- **Deep link** : `parseCiraInviteCode` reconnaît `vayra://cira/invite#t=…`
  dans le bridge existant ; `CiraInviteBridge` (App) mémorise le code et
  ouvre Réglages → CIRA où une modale preview → accepter/refuser tranche.
- **`CiraProvider`** (`src/lib/cira/provider.tsx`, monté entre
  `TogetherProvider` et `ViewProvider`) : possède le repository (singleton
  Supabase via `getVayraSupabaseClient`), recharge les listes sur chaque ping
  realtime (coalescé à 250 ms), et gère le battement de présence sous
  consentement : session UUID stable, cadence 45 s (TTL SQL ≤ 120 s), état
  `in_vara` dérivé de la room VARA active, `clearPresence` à la fermeture.
- **Panneau Réglages → CIRA** (`src/views/settings/cira-panel.tsx`) :
  profil (handle + display name, validation miroir des contraintes SQL),
  demandes entrantes/sortantes, liste d'amis avec présence + retirer/bloquer
  (confirmation), invitations (créer/copier/révoquer un lien, ajout par
  handle, coller un code), consentement présence, débloquages. Erreurs
  mappées code → message, jamais de token affiché ailleurs que dans l'URL
  copiable montrée une seule fois.
- **Repository** : ajout de `listInvitations()` (repli status/outcome →
  enum client à 5 états) pour la liste révocable.

## Vérifications

| Vérification | Résultat |
|---|---|
| Tests SQL (harnais Postgres 15) | 10/10 PASS |
| Tests TypeScript (vitest) | 216/216 PASS |
| `tsc -b` | OK |
| `eslint --max-warnings 0` | OK |
| Page invite (serveur statique + navigateur) | rendu, deep link et normalisation vérifiés |

Non vérifié en conditions réelles : le flux complet in-app contre la prod
(les migrations n'y sont pas encore appliquées — voir ci-dessous).

## 4. Production — geste manuel restant

Aucun credential prod n'existe localement (pas de Supabase CLI, pas d'URL
DB, seule la clé anon publique) : l'application des **4 migrations** se fait
dans le dashboard Supabase → SQL Editor, en suivant `supabase/README.md`
(contrôle des collisions avant, les 4 fichiers dans l'ordre des timestamps,
comptages après — dont 7 triggers `cira_%` et la policy
`cira_receive_own_channel` sur `realtime.messages`). Le déploiement Vercel
du site (`site/public/cira/invite.html`) suit le push du repo.
