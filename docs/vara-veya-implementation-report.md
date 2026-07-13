# VARA distante + VEYA — Compte rendu d’implémentation

Branche : `feat/vara-remote` — base `main` au commit `0d51fcd`.

## Travaux livrés

| Domaine | Fichiers principaux | Résultat |
|---|---|---|
| Rooms privées | `20260713290000_vara_remote_rooms.sql` | Lifecycle, capacité, expiration, lease, transfert et topic rotatif |
| Invitations CIRA | `20260713300000_vara_remote_invites.sql` | Directes et liens courts hashés, blocage comme frontière immédiate |
| Repository | `src/lib/vara/` | Décodage strict des RPC, erreurs typées, aucun secret persistant |
| Transport | `websocket-transport.ts` | Canal Realtime privé, présence, reconnexion, snapshot mémoire |
| VEYA | `use-veya-sync.ts`, `use-playback-controls.ts` | Play/pause/seek et heartbeat via `PlayerBridge`, anti-boucle |
| Runtime | `src/lib/vara/provider.tsx` | Session Supabase, room active en mémoire, invalidations, conflit Together |
| Invitations web | `site/public/vara/invite.html`, `deep-link.ts` | Fragment secret validé, effacé et transmis au scheme VAYRA |
| UI | `vara-rooms-card.tsx`, `vara-status-pill.tsx` | Gestion complète et statut player monochrome |
| i18n | `src/lib/i18n/locales/cira.ts` | EN, FR, DE, ES, IT, PT et AR |

## Micro-commits de la branche distante

- `d135cca feat(vara-db): establish private remote rooms`
- `21a1e69 feat(vara-db): add CIRA room invitations`
- `5adaaf6 feat(vara): add remote room repository`
- `1084c21 feat(veya): add private WebSocket transport`
- `f52ff04 feat(vara): orchestrate authenticated remote rooms`
- `36d270b feat(vara): add private invitation deep links`
- `670b76f feat(vara): add remote room controls`
- `3551cd1 fix(vara): preserve rooms across transport disconnects`
- `49e7d50 feat(veya): synchronize remote playback controls`
- `d1d22ad feat(vara): localize remote room experience`
- `638a9b9 feat(vara): complete private room lifecycle controls`

## Contrôles exécutés le 13 juillet 2026

- `bash scripts/cira/db-test.sh` : 18 fichiers SQL passés, 0 échec.
- `pnpm test` : 34 fichiers, 311 tests passés.
- `pnpm exec tsc -b` : succès.
- `pnpm lint` : succès.
- `pnpm build` : succès ; avertissements Vite préexistants sur chunks et imports.
- `git diff --check` : succès.
- CI GitHub `frontend` sur `04a7f0a` : succès.

## Confidentialité et sécurité

- Aucun média, source, titre, historique, addon, bibliothèque, IP ou appareil
  dans le schéma ou les payloads VEYA.
- RLS sur les quatre tables, RPC authentifiées, aucun droit `anon`.
- Secret d’invitation hashé au repos et absent des query strings.
- Topic Realtime opaque et rotatif pour invalider les connexions révoquées.
- Session Stremio indépendante et inchangée.
- Transport local déconnecté sans supprimer la membership persistante ; seule
  l’action explicite Quitter/Fermer modifie la base.

## Déploiement Supabase

- Sauvegarde structurelle pré-VARA :
  `/Users/eybo/.codex/backups/vayra/2026-07-13-pre-vara/manifest.md`, permissions
  `600`, SHA-256 `4708bf5a73e9173a79a3561077196f8642f988329f96f56fddb0a415ad072557`.
- Migrations `20260713290000` et `20260713300000` appliquées chacune dans une
  transaction et inscrites dans `supabase_migrations.schema_migrations`.
- Recette `scripts/vara/remote-smoke.sql` : succès à deux comptes, rollback
  confirmé, aucun compte synthétique résiduel.
- Audit distant : 4/4 tables RLS, 18 RPC publiques, 0 droit d’exécution
  `anon`/`PUBLIC`, 2 policies Realtime VARA et trigger de frontière blocage actif.
- Realtime : `private_only=true`, `presence_enabled=true`, service non suspendu ;
  les quotas existants n’ont pas été modifiés.

Les ports PostgreSQL 5432/6543 étaient inaccessibles depuis le poste ; le
déploiement a donc utilisé l’endpoint SQL HTTPS officiel de la Management API.

## Validation manuelle restante

Une recette de lecture sur deux appareils reste nécessaire avant d’élargir la
bêta : ouverture locale du même contenu, play/pause/seek dans les deux sens,
join tardif, transfert d’hôte, reconnexion et absence de boucle. Aucun test
automatique ne remplace cette validation visuelle, mais elle ne bloque pas la
fusion d’une fonctionnalité limitée aux comptes bêta invités.
