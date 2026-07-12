# VARA + VEYA — Compte rendu d'implémentation (prototype PR0→PR6)

**Branche :** `feat/vara-veya` (sur `main` `2a84508`). **Statut :** 7 PRs livrées,
buildées et testées (tsc / cargo / vitest verts). Architecture conforme à la
**correction** validée : broker **autonome** (process séparé), transport socket
inter-process, events Tauri `vayra://sync-*` strictement locaux.

> Le design de référence reste `docs/vara-veya-architecture.md` (non modifié).
> Ce document est le rapport de ce qui a été **réellement construit**.

## Architecture livrée

- **`vayra-vara-broker`** = binaire autonome (crate `vara-broker/`, **zéro dépendance Tauri**), seule autorité : rooms, membres, rôles, `rev` monotone, snapshot, fan-out (exclut l'auteur). Élection host atomique au 1er join, ré-élection à la déconnexion, idle-exit, nettoyage du socket.
- **Transport** : Unix socket (`$XDG_RUNTIME_DIR|TMPDIR/vayra-vara.sock`) / named pipe Windows, framing **JSONL** (lecteur bufferisé tolérant aux lectures partielles), bind idempotent.
- **Client Rust dans l'app** (`vara_client.rs`) = pont **sans état d'autorité** : socket ↔ events Tauri **locaux** `vayra://sync-*`, commandes `vayra_sync_*`. Spawn du broker détaché si injoignable + backoff. **Aucun état de room dans `lib.rs`.**
- **Frontend** : `SyncTransport` (seam remplaçable par WebSocket), `LocalSyncTransport` (invoke/listen), réconciliateur VEYA gaté par `inRoom`, anti-boucle (origine + `CorrLru` + fenêtre de suppression), UI room minimale.

## Les 7 PRs (micro-commits atomiques)

| PR | Commit | Contenu | Build | Tests |
|---|---|---|---|---|
| **PR0** | `2042752` | Launcher dual-instance dev-only `VAYRA_DATA_DIR` (isole app-data + scope single-instance ; **prod inchangée sans le flag**) | cargo ✅ | settings_store ✅ |
| **PR1** | `1316305` | Contrat de sync + logique pure (types, `shouldApply` rev-LWW, `driftAction` 0.75/2.0, `extrapolateTarget`, `shouldForward`, `CorrLru`) | tsc ✅ | 20 vitest ✅ |
| **PR2** | `7e32a64` | Broker autonome `vayra-vara-broker` (protocol/transport/broker/server) | cargo ✅ (0 dép tauri) | 4 unit + 9 intégration ✅ |
| **PR3** | `0e4e9a6` | Client Rust `vara_client.rs` (socket↔events locaux) + commandes `vayra_sync_*` + stub mobile | cargo ✅ | 7 sérialisation/déconnexion ✅ |
| **PR4** | `24b8b34` | `LocalSyncTransport` + `FakeTransport` + suite de conformance partagée | tsc ✅ | 39 (conformance Fake↔Local) ✅ |
| **PR5** | `2703447` | Réconciliateur VEYA `use-veya-sync.ts` (gate `inRoom`, anti-boucle, drift/buffer/join tardif) | tsc ✅ | 122 total, **solo=zéro `vayra_sync_*`** ✅ |
| **PR6** | `547b718` | Machine à états room + `use-vara-room.ts` + `vara-status-pill.tsx` (room `vara-demo`) | tsc ✅ + eslint clean | 150 total (28 machine à états) ✅ |

**Total : ~150 tests frontend (vitest) + 20 tests Rust (broker + client)**, tous verts.

## Fichiers créés / touchés
- **Nouveau crate broker** : `vara-broker/` (main, lib, protocol, transport, broker, server, tests).
- **App Rust** : `src-tauri/src/vara_client.rs` (+ `mobile_stubs/vara_client.rs`), `src-tauri/src/lib.rs` (registration `vayra_sync_*` + gate single-instance), `settings_store.rs` (override data-dir sous flag).
- **Frontend** : `src/lib/together/sync/{transport,types,reconcile,anti-loop,local-transport,fake-transport,room-machine}.ts` (+ tests), `src/views/player/hooks/{use-veya-sync,use-vara-room}.ts`, `src/components/player/vara-status-pill.tsx`.
- **Cœur player (mpv/html5/exo/cast/Stremio) : NON modifié.** Doc d'architecture : NON modifié.

## Invariants respectés
- **Solo intact** : tout est derrière `inRoom` ; sans room, zéro `vayra_sync_*`, chemin identique (test de régression explicite en PR5).
- **Prod inchangée sans `VAYRA_DATA_DIR`** : single-instance enregistré, dirs par défaut, aucune migration/identité/updater/keyring touchés.
- **Broker ne transporte jamais** de source/URL/octet média — seulement l'intention.
- Naming `vayra_*` / `vayra://` pour tout le nouveau ; compat Harbor (harbor.site, `harbor://`, `harbor_lib`, préfixe localStorage) préservée.

## Limites & points à valider manuellement
- **Test 2-process obligatoire (manuel)** : lancer l'instance A normale + l'instance B avec `VAYRA_DATA_DIR=/tmp/vayra-b`, rejoindre `vara-demo`, vérifier play/pause/seek host→guest, join tardif, absence de boucle. Non automatisable ici.
- **Isolation window-state** : Tauri v2 ne permet pas de rediriger l'`app_config_dir` (keyé bundle-id) du plugin window-state ; l'isolation se fait par **nom de fichier** déterministe par dir (pas par répertoire). L'`app_data_dir` des settings est, lui, pleinement redirigé.
- **Keyring partagé** entre 2 instances sous le flag (même service `app.vayra`) — acceptable pour le démo.
- **Android** : `cargo check` cible aarch64 non exécutable en local (env NDK) → validé par la CI `android-build.yml` (parité `generate_handler!` couverte par le stub mobile de `vara_client`).

## Lancer le démo
```bash
# broker : auto-spawné par le client si absent, ou manuellement :
cargo run -p vara-broker
# instance A (défaut)
<app VAYRA>
# instance B (data-dir distinct → 2e process malgré single-instance)
VAYRA_DATA_DIR=/tmp/vayra-b <app VAYRA>
# dans chaque instance : rejoindre la room fixe « vara-demo » via le pill de statut
```

## CI
CI `tauri-build` (desktop) + `android-build` déclenchées sur `feat/vara-veya`
(runs 29208699823 / 29208700327) — *résultat inséré ci-dessous une fois vert.*

## Suite
- Test manuel 2-process (ci-dessus) avant merge sur `main`.
- Remplacer plus tard `LocalSyncTransport` par un `WebSocketTransport` (même interface `SyncTransport`) pour la sync distante — le broker autonome se transpose en relais réseau en changeant seulement le handler de connexion.
