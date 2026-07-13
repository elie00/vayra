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

## Confidentialité et sécurité

- Aucun média, source, titre, historique, addon, bibliothèque, IP ou appareil
  dans le schéma ou les payloads VEYA.
- RLS sur les quatre tables, RPC authentifiées, aucun droit `anon`.
- Secret d’invitation hashé au repos et absent des query strings.
- Topic Realtime opaque et rotatif pour invalider les connexions révoquées.
- Session Stremio indépendante et inchangée.
- Transport local déconnecté sans supprimer la membership persistante ; seule
  l’action explicite Quitter/Fermer modifie la base.

## Déploiement restant

Avant fusion dans `main` : sauvegarde distante, dry-run Supabase, application des
deux migrations, recette SQL transactionnelle à deux comptes, confirmation du
mode Realtime privé, puis recette manuelle de lecture sur deux appareils. Aucun
test automatique ne remplace cette dernière validation.
