# Passation — VAYRA

## État actuel (top-line) — mis à jour le 2026-09-22
- **Périmètre** : depuis l'audit du 2026-09-05 (`docs/audit-global-2026-09-05.md`),
  **usage personnel sur ce Mac uniquement** (voir `AGENTS.md`). Web, Android,
  Windows, Linux, signature Developer ID et notarisation sont **en pause** ; les
  sections « Travaux réalisés » ci-dessous (juillet) restent comme historique.
- **Repo** : `elie00/vayra`, remote `origin`.
- **Branches** : `codex/pause-resume-downloads` (travail macOS du 04/09 au 22/09)
  fusionnée dans `main` par pull request le 2026-09-22. `main` est de nouveau la
  référence.
- **App installée** : `/Applications/VAYRA.app` 0.9.42 (binaire `Contents/MacOS/vayra`,
  SHA-256 `d4f7c3c6…`), construite le 2026-09-23 avec les lots 1 à 7 (sauf le
  retrait de `router.silotis.us`), signée Apple Development. Versions précédentes
  dans `~/Library/Application Support/VAYRA-backups/` (`20260923-182551` = lots 1–6,
  `20260922-211836` = lots 1–5, `20260922-200326` = lots 1–3, `20260922-194342` = journal de pairs,
  `20260922-192818` = build du 12/09).
- **Vercel** : le projet `vayra-site` (production `https://vayra.eybo.tech`) est relié
  au dépôt, Root Directory `.` et `pnpm build:web` : il construit l'**app web**
  depuis la racine, pas seulement `site/`. Chaque push de branche crée un Preview ;
  un push sur `main` publierait en production, mais `vercel.json` porte
  `git.deploymentEnabled.main: false` depuis la fusion du 22/09 (web en pause) :
  la production reste à `d041edd` (31/08). Retirer ce bloc pour republier.
- **Signature locale** : `scripts/bundle-libmpv-macos.mjs` signe les builds locaux
  avec l'unique identité « Apple Development » du trousseau (sans hardened runtime
  ni horodatage : même comportement qu'ad hoc). La règle de signature (identifiant
  `app.vayra` + nom du certificat) reste la même d'un build à l'autre, donc
  « Toujours autoriser » dans le trousseau n'est demandé qu'une fois. Le certificat
  expire le **2026-10-02** : le renouveler via Xcode (même nom, même règle). Sans
  identité valide, retour automatique à l'ad hoc (invite à chaque build). La
  release CI (Developer ID via `APPLE_SIGNING_IDENTITY`) est inchangée.
- **Chantier en cours** : lecture de sources torrent à pairs intermittents
  (cas Hijack S2E01 / HiggsBoson, `docs/design-reviews/2026-09-12-hijack-peer-loading.md`).

## Lot n°1 — pairs torrent et diagnostic
- `src-tauri/src/torrent_engine.rs` : `peer_opts()` passe `read_write_timeout`
  10 s → 60 s et `keep_alive_interval` → 20 s (connexion TCP gardée à 7 s), et
  s'applique aussi aux `SessionOptions`. Cause de la perte des pairs **non établie**.
- `src-tauri/src/torrent_engine/peer_log.rs` : journal de diagnostic. Toutes les
  10 s, pour chaque torrent actif non terminé, une ligne sur stderr **quand les
  compteurs changent** :
  `[torrent-engine] peers <hash8> <state> seen= queued= connecting= live= dead= not_needed= down=KiB/s progress=%`.
  Lecture : `seen` bas → problème de découverte (trackers/DHT) ; `seen` élevé et
  `dead` qui grimpe pendant que `live` retombe à 0 → pairs trouvés puis perdus.
- Test réseau ignoré par défaut `real_swarm_download_makes_progress` (Sintel,
  session jetable dans `$TMPDIR`, options de production) :
  `cargo test --lib real_swarm_download -- --ignored --nocapture`.
- Vérifié le 2026-09-22 : Sintel entier (129 Mo) téléchargé en < 10 s avec les
  nouvelles options ; `cargo test --lib` 60/60 (+1 ignoré) ; clippy propre sur les
  fichiers du lot ; frontend `tsc -b`, `pnpm lint`, `pnpm test` 947/947.
  Sintel est un essaim sain : cela prouve l'absence de régression, pas un gain
  sur un essaim pauvre.
- **Reste** : recette HiggsBoson dans l'app avec le journal (voir « Pièges » pour
  retrouver les journaux), puis décider : garder les délais, ou corriger
  la vraie cause révélée par le journal (lignes `[torrent-engine] peers` dans
  `~/Library/Logs/VAYRA/vayra.log`).
- `selftest/stream_probe.rs` utilise désormais `peer_opts()` : l'auto-test
  reflète les options de production.

## Lot n°2 — secrets hors du localStorage (audit P1)
- Constat vérifié sur ce Mac le 2026-09-22 (noms des champs seulement) :
  `harbor.settings.shared` contenait en clair `tmdbKey`, `togetherCfToken`, `webhooks`.
- `src/lib/settings/secret-vault.ts` : le trousseau stocke désormais
  `{ v: 2, sources: { <clé de blob>: secrets } }` (partagé + chaque profil non lié),
  et répète à plat les secrets du profil actif pour qu'un retour à une ancienne
  version (sauvegarde `VAYRA-backups/`) retrouve au moins ceux-là. Une ancienne
  version qui réécrit le trousseau efface en revanche les `sources` des autres profils.
- Au démarrage, `hydrateSecretVault` déplace les secrets de tous les blobs vers le
  trousseau et ne vide les blobs **qu'après une écriture réussie**. Échec de lecture
  → rien n'est touché ; échec d'écriture ultérieur → secrets réécrits dans les blobs.
- `stremio-server.ts::remoteStreamServerUrl` lit le trousseau : avant, il lisait le
  miroir `harbor.settings`, déjà purgé des secrets 600 ms après chaque sauvegarde.
- Compromis : avant l'hydratation (quelques ms, ou tant qu'une invite du trousseau
  est ouverte), le premier rendu n'a pas les secrets.
- Tests : `secret-vault.test.ts` (7 cas, dont la reproduction de l'audit ; vérifiés
  par mutation). Suite frontend 954/954.
- Vérifié sur l'app installée le 2026-09-22, après autorisation du trousseau :
  plus aucun champ secret non vide dans `harbor.settings.shared` ni `harbor.settings`
  (contrôle sur copie de `localstorage.sqlite3`, noms de champs seulement).

## Lot n°3 — entretien (2026-09-22)
- `download.rs:161` : cast `u64 → u64` retiré ; `cargo clippy --all-targets -- -D warnings` propre.
- Dépendances : browserslist, js-yaml, baseline-browser-mapping mis à jour dans le
  lockfile ; vitest 3.2.6 → 4.1.11 (traversée de chemin via `@vitest/mocker`).
  `pnpm audit` : aucune vulnérabilité. Suite inchangée : 954/954.
- `lib.rs::redirect_stderr_to_log` (voir « Pièges »).

## Lot n°4 — ne pas démarrer une source dans une autre langue (2026-09-22)
- Cause du 12/09 (HiggsBoson → « NoTorrent Audio Latino ») : avec Lecture
  instantanée, un échec relance `openPicker({ autoPlay, attempt: n+1 })`, qui prend
  `autoCandidates[attempt + idx]`. La langue n'était vérifiée que sur le raccourci
  « haute confiance » de la première tentative ; ailleurs elle n'était qu'un critère
  de tri secondaire, derrière « en cache ». Une source debrid en cache dans une
  autre langue passait donc devant une source P2P française.
- `use-auto-candidates.ts` : une source qui **déclare** uniquement d'autres langues
  audio que celles préférées n'est plus candidate au démarrage automatique (même
  principe que `episodeConflict` : échouer plutôt que deviner). Inchangé : sources
  sans langue ou « Multi », source mémorisée, salle (suit la source de l'hôte),
  aucune langue préférée. Si plus rien ne convient, le sélecteur reste affiché.
- Corps du `useMemo` extrait en `buildAutoCandidates` (fonction pure) pour le test
  `use-auto-candidates.test.ts` (3 cas, dont celui du 12/09, échoue avant correctif).
  Suite frontend 957/957.
- CI du 22/09 : `frontend` vert (premier depuis le 06/09, qui échouait sur
  `pnpm audit`) ; job Android en échec dès `android-actions/setup-android@v3`
  (l'action cible Node 20, forcée sous Node 24, plante à l'acceptation des
  licences SDK — outillage, avant compilation ; Android en pause). `clippy + test`
  vert sur macOS (en échec au run précédent), Ubuntu et Windows.

## Lot n°5 — Échap en plein écran (décision du 2026-09-22)
- Règle validée par l'utilisateur : en plein écran, Échap **sort d'abord du plein
  écran** ; un second Échap ferme la vidéo (avec confirmation si
  `playerConfirmLeave`). C'était déjà le comportement par défaut
  (`playerEscExitsFullscreen: true`, actif sur ce Mac) ; le raccourci global
  Échap = retour est désactivé pendant la lecture (`App.tsx`, `enabled: !player`).
- La règle est extraite en `src/views/player/escape-action.ts` et verrouillée par
  `escape-action.test.ts` (3 cas). Suite frontend 960/960.

## Lot n°6 — signature stable, diagnostic, mesures (2026-09-22)
- Signature locale stable (voir en-tête).
- `src-tauri/src/app_log.rs` : stderr → `~/Library/Logs/VAYRA/vayra.log` via un pipe
  qui **masque les URLs** (`schéma://hôte/…`, magnet réduit à son hash ; loopback
  intact). Sans cela, `mpv.rs` (loadfile), les erreurs `reqwest` et les trackers
  auraient écrit tokens debrid et passkeys sur disque. Vérifié : aucune URL distante
  n'avait encore fuité. Hors périmètre : `harbor-mpv.log` (journal mpv, séparé).
- `app_log::init_tracing` : avertissements de toutes les crates + niveau debug de
  `librqbit::torrent_state::live` (erreurs de pair, backoff, pièces vérifiées), avec
  le contexte `torrent{id}:manage_peer{peer}`. Le test Sintel l'active aussi.
- `src-tauri/src/playback_metrics.rs` : une ligne par chargement mpv,
  `first frame after N ms (file open after M ms), peak memory X MB`, et le pic
  mémoire à chaque `end-file`.
- `auto-exhausted-modal.tsx` : si la lecture automatique s'arrête parce que toutes
  les sources sont dans d'autres langues (lot 4), le message le dit au lieu
  d'accuser debrid ou addons (singulier/pluriel, traduit en français).
- `deleteProfile` passe par `dropProfileBlob`, qui efface aussi l'entrée du profil
  dans le trousseau (le blob, lui, était déjà supprimé).
- CI : `android-actions/setup-android` v3 → v4 (action migrée vers Node 24).
- Tests : Rust 71/71 (+1 ignoré), frontend 964/964.
- Premier journal réel (22/09) : `librqbit_upnp` échoue à la découverte SSDP
  (`No route to host`, os error 65) → pas de redirection de port, donc pas de
  connexions entrantes. Piste pour les essaims pauvres : autorisation « Réseau
  local » de VAYRA (Réglages Système → Confidentialité) ou routeur sans UPnP.
  Le routeur DHT `router.bitcomet.com` ne résout plus (sans effet, tier 1 atteint).
- Reste : afficher « aucun pair trouvé » / « pairs perdus » pendant le chargement,
  une fois la recette HiggsBoson faite (il faudra exposer `seen`/`dead` dans
  `TorrentEngineStats`) ; mesurer l'effet de l'intervalle de 2 s de
  `use-fullscreen.ts` avec les nouvelles mesures avant d'y toucher.

## Lot n°7 — le nettoyeur de cache supprimait des torrents en cours (2026-09-23)
- Cause trouvée grâce au journal : `error dumping DHT: error renaming dht.json.tmp.<pid>
  … No such file or directory`. `cache_sweep::run` lit `now` au début du balayage ; une
  entrée modifiée ensuite a un âge négatif, `duration_since` échoue et
  `unwrap_or(true)` la classait **expirée** → supprimée. Touchait le fichier temporaire
  du DHT (réécrit toutes les 3 s) mais aussi **tout torrent en cours d'écriture** :
  fichier, ou dossier entier (`remove_dir_all`) quand un fichier y était créé.
  Explication probable des disparitions de la recette du 12/09 (HiggsBoson absent du
  cache, marqué indisponible), non prouvée faute de journal à l'époque.
- Correctif : âge négatif = récent ; date illisible = entrée conservée.
- Rétention « Off » (décision utilisateur du 23/09) : supprimait tout toutes les 30 s,
  lecture en cours comprise. Elle garde désormais ce qui a été écrit depuis moins de
  10 min. librqbit lit par ses fichiers ouverts : une vidéo terminée retirée du cache
  continue de jouer, l'espace est libéré à la fermeture du torrent.
- `dht_boot.rs` : `router.bitcomet.com` retiré (NXDOMAIN ; ~3 500 avertissements
  par jour dans `vayra.log`) et `router.silotis.us` retiré (IPv6 seulement, alors que
  le DHT de librqbit n'ouvre qu'un socket IPv4 `0.0.0.0:0` : amorçage toujours en échec).
- Signature stable **vérifiée** le 23/09 : installation d'un nouveau build sans
  aucune invite du trousseau.
- Tests : `cache_sweep` 3 cas (défaut reproduit avant correctif). Rust 74/74.

## Travaux réalisés (historique, juillet 2026 — multiplateforme en pause)

### 1. Audit perf Cast — 6 findings prouvés corrigés + fixes matériels
- `94f865b` fuite FFmpeg/HLS non libérée à Stop Cast → `ProxyState::release` + globale `ACTIVE_PROXY` (cast.rs).
- `cb5d924` profil appareil écrasé par UNIVERSAL_SAFE_PROFILE → `pickCastTranscodeProfile` (cast-resolve.ts).
- `5f897a6` polling `setInterval` → boucle auto-planifiée `startSerializedPoll`.
- `fa8578f` reconnexion Chromecast à chaque tick → `ChromecastConn` (thread dédié car `CastDevice` `!Send`) + cache `STATUS_CONN`, sender cloné hors verrou.
- `f38fb92` rendu position 1 Hz de tout le player → store ref-based `src/lib/player/cast-interp.ts` (useSyncExternalStore, interpolation, anti-recul sauf seek, float précis via `getCastPositionPrecise`).
- `f497d95` rafale DLNA (~14 URL Samsung/appareil) → fallbacks Samsung seulement si hint SSDP/échec + scan frontend annulable (jeton de génération) dans cast-menu.tsx.
- Antérieurs (Codex) : `c1c6eaa`, `6f31391`, `daa21d9`, `6952623`, `962c5d0`, `367e9ee`.
- ⚠️ **À valider sur vrai matériel** (aucun device en CI) : cast Chromecast réel (pas de reconnexion/tick, reprise après veille, Stop réactif) ; TV Samsung dont le SSDP ne contient pas « samsung ».

### 2. i18n — 3 langues + bug pré-existant
- `f7d6b7e` / `cd17c5f` / `2325dd1` locales complètes **es / de / it** (parité totale avec `en.ts`, tests de parité `*.parity.test.ts`).
- ⚠️ Bug corrigé dans `f7d6b7e` : `store.ts::setUiLanguage` ne laissait passer que `ar`/`fr` (hardcodé) → **pt était déjà cassé** (retombait sur en). Corrigé : validation contre `LANGUAGES`. `Settings.uiLanguage` union littérale → `UiLanguage`.
- Langues livrées : ar, pt, fr, es, de, it. Ajouter une langue = fichier plat `xx.ts` (canonique = `en.ts`) + `xx.parity.test.ts` + enregistrement dans `languages.ts` (type + LANGUAGES) et `translate.ts` (import + catalogs).

### 3. Android
- `7276544` **build Android réparé** : `generate_handler!` référençait 3 commandes desktop (`mpv_audio_devices`, `hdr_overlay_hide`, `tray_set_custom_themes`, restaurées dans `c493c78`) **sans stubs mobiles** → `E0433`. Stubs ajoutés dans `mobile_stubs/`. APK reconstruit, bootant, vérifié sur émulateur.

### 4. CI / Windows / Linux — « finir le dev » = produire les installeurs
- `c7908ea` `pnpm/action-setup` : retiré la version épinglée (conflit avec `packageManager`) — bloquait **tous** les jobs.
- `a5def07` macOS Intel retiré de la matrice.
- `77653dc` checksums portables `sha256check` (sha256sum/shasum/certutil) — runners Windows sans `shasum`.
- `c5c7881` **fix Windows** : ressource sidecar `mpv.exe` déclarée mais jamais fournie → retirée (runtime la gère déjà comme optionnelle via `if mpv.exists()`).
- `41149b4` **fix Windows** : `force_show_foreground` appelée sous `#[cfg(windows)]` dans tray.rs mais **jamais définie** (code Windows jamais compilé) → implémentée dans lib.rs (Win32 SetForegroundWindow, features déjà présentes).
- `a137695` prépare les trois sidecars externes attendus par Tauri pendant les
  contrôles statiques, sans remplacer les téléchargements vérifiés du workflow
  de release.
- `d430afc` / `0b87cd0` gardent Clippy strict et isolent uniquement les lints de
  style déjà identifiés dans les chemins player natifs Linux/Windows ; leur
  correction source attend un test de lecture manuel sur la plateforme.
- `d8b5fdf` exécute le script multiplateforme de Clippy/tests sous Bash, y
  compris sur Windows.
- `04914f4` corrige deux emprunts superflus lors de l'initialisation de la
  fenêtre Windows, sans toucher au player.

### 5. Fiabilisation tests & CI Node 24 (session 2026-07-17)
- `8e2ce73` **test flaky corrigé** : `local-transport.test.ts` échouait
  aléatoirement quand toute la suite tournait en parallèle — son `flush()`
  attendait 10 ms d'horloge murale, parfois insuffisant pour résoudre les
  imports dynamiques mockés. Remplacé par 20 tours de boucle d'événements
  (déterministe quelle que soit la charge). Suite frontend : 405/405 stable.
- `d9f4df3` **CI migrée vers Node 24** : checkout v4→v6, setup-node v4→v6,
  setup-java v4→v5, upload-artifact v4→v6, pnpm/action-setup v4→v6, et
  `node-version` 20→24 (Node 20 EOL avril 2026). Notes de version vérifiées :
  aucun changement cassant pour notre usage (`cache: pnpm` explicite toujours
  supporté, pas de trigger `pull_request_target`, `pnpm/action-setup` lit
  toujours `packageManager`). Les v7 de checkout/setup-node (sorties < 1 mois)
  ont été volontairement évitées au profit des v6 éprouvées.
- `e94c1e6` **fenêtre qui rétrécit en sortant de la lecture corrigée** : deux
  défauts cumulés. (1) Le chemin Échap du player (`exitAnyFullscreen`)
  appelait `setFullscreen(false)` directement, court-circuitant
  `window_fullscreen_exit` et sa restauration de géométrie → routé via
  `exitWindowFullscreen`. (2) `window_fullscreen_enter` dé-maximise avant le
  fullscreen mais la sortie ne re-maximisait jamais, et sur macOS la
  restauration de taille était appliquée pendant l'animation asynchrone de
  sortie (avalée) → `was_maximized` mémorisé, attente de fin de transition,
  re-maximisation avec retry. ⚠️ **À valider sur l'app buildée** (comportement
  fenêtre non testable en unit) : fenêtre agrandie → vidéo → fullscreen → Échap
  doit rendre la taille d'avant.

### 6. Packaging & docs
- `d15f49f` `bundle.category/shortDescription/longDescription/homepage/publisher` (alimentent .desktop/AppStream Linux, deb/rpm, NSIS Windows, catégorie macOS).
- `5dc996d` / `2a036da` roadmap README mise à jour (platform hardening coché ; statut réel des items ouverts).

## Pièges à connaître (récurrents)
- **Licence Xcode** : après une mise à jour d'Xcode, tout build Rust échoue au
  link (« You have not agreed to the Xcode license agreements »). Remède :
  `sudo xcodebuild -license accept` (fait le 2026-09-22), ou en attendant
  `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.
- **Journaux Rust** : lancée depuis le Finder, l'app redirige stderr (tous les
  `eprintln!`, dont `[torrent-engine]`) vers `~/Library/Logs/VAYRA/vayra.log`
  (une génération `.log.1` gardée au-delà de 10 Mio). Lancée depuis un terminal,
  stderr reste dans le terminal. Les journaux internes de librqbit passent par
  `tracing`, non collecté.
- **Build = WASM régénéré** : `pnpm build` relance `wasm-pack`, qui réécrit
  `vayra-core/pkg/.gitignore` en `*` et le `.wasm`. Restaurer avec
  `git checkout -- vayra-core/pkg` si `vayra-core/` n'a pas changé.
- **PATH rustup obligatoire pour le wasm** : avec le PATH par défaut, `pnpm
  build`/`pnpm core:wasm` utilisent le `rustc` Homebrew (`/opt/homebrew/bin`),
  qui n'a pas la cible `wasm32-unknown-unknown`. Préfixer
  `export PATH="$HOME/.cargo/bin:$PATH"` (comme pour Android).
- **Cache Cargo pollué par l'ancien chemin `harbor/`** : tout
  `src-tauri/target` antérieur au renommage `~/PycharmProjects/harbor` →
  `~/PycharmProjects/vayra` contient des chemins absolus périmés et fait
  échouer le build local (« failed to read plugin permissions …/harbor/… »)
  alors que la CI est verte. Remède :
  `cargo clean --manifest-path src-tauri/Cargo.toml`.
- **Parité stubs mobiles** : toute commande de `generate_handler!` doit avoir un stub `mobile_stubs/<module>.rs`, sinon build Android `E0433`. Vérif rapide : `cargo check --target aarch64-linux-android --lib` (env NDK/CC requis).
- **`.gitignore` global `lib/`** : masquait les nouveaux fichiers sous `src/lib/`. Résolu par `!/src/lib/` dans le `.gitignore` du repo (sinon `git add -f`).
- **Cross-compile impossible depuis macOS** : le code `#[cfg(windows)]`/`#[cfg(linux)]` n'est PAS vérifié par `cargo check` hôte, et cross-check bute sur `libmpv2-sys` (besoin de mpv.lib/X11). **Seule la CI valide Windows/Linux.**
- **CI = seul juge Windows/Linux** : itérer via `gh workflow run tauri-build.yml --ref main` puis lire `gh api repos/elie00/vayra/actions/jobs/<id>/logs`.

## Suivi restant (non bloquant — hors périmètre macOS, en pause)
- **Linux** : build/packaging finis et verts ; le *polish du lecteur mpv natif* reste à valider sur une vraie machine Linux (rendu vidéo — ne pas modifier sans test de lecture sur plateforme).
- **Windows** : multiview/DVR/vignettes utilisent le `mpv` du PATH tant qu'un `mpv.exe` **vérifié (checksum) et hébergé** n'est pas re-bundlé (ressource retirée dans `c5c7881`). Lecture cœur OK via `libmpv-2.dll` embarquée.
- **AirPlay 2 comme cible de cast** : hors portée (protocole propriétaire SRP/FairPlay + Apple TV requis) ; actuellement détecté et grisé (`airplay2_pairing`).
- **More translations** : ouvert (ajouter d'autres langues au besoin).

## Build / vérif par plateforme
- **Frontend** : `pnpm exec tsc -b && pnpm lint && pnpm test`. Pour le build
  complet (`pnpm build`), préfixer `export PATH="$HOME/.cargo/bin:$PATH"`
  (cible wasm absente du rustc Homebrew).
- **Rust desktop** : `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --all-targets -- -D warnings`.
- **Android** : `export PATH="$HOME/.cargo/bin:$PATH" ANDROID_HOME=… NDK_HOME=…/27.3.13750724 JAVA_HOME=/opt/homebrew/opt/openjdk@17` puis `pnpm tauri android build --target aarch64` (APK dans `gen/android/app/build/outputs/apk/universal/release/`).
- **macOS** : `pnpm run tauri:build:macos` (build + bundle libmpv autonome).
- **Windows / Linux** : via CI uniquement (`gh workflow run tauri-build.yml --ref main`).
