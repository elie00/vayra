# Passation — VAYRA

## État actuel (top-line)
- **Repo** : `elie00/vayra` (autonome, détaché de `harborstremio` ; remote `origin`).
- **Branche de référence** : `main`, poussée sur `origin`. Les anciennes branches de livraison ne doivent pas être assimilées à `main` sans comparaison Git.
- **CI** : la branche `ops/release-readiness` est entièrement verte sur le run
  [`29248392883`](https://github.com/elie00/vayra/actions/runs/29248392883) :
  APK Android debug, Clippy et tests Rust sur macOS, Windows et Linux. La passe
  prépare des placeholders de sidecars uniquement pour les contrôles statiques ;
  les builds de release continuent de télécharger les binaires réels vérifiés.
  Cette branche reste à relire puis à intégrer à `main`.
- **Monorepo** : application à la racine, site public et fonctions Vercel sous `site/`. Vercel suit `elie00/vayra`, branche `main`, Root Directory `site`.
- **Artefacts locaux** : `.claude/`, les assets Android générés et
  `tauri.properties` sont ignorés. L'architecture VARA/VEYA est versionnée dans
  `docs/vara-veya-architecture.md`.
- **Binaires locaux livrés** : `/Applications/Harbor.app` (macOS, reconstruite à jour), `~/Desktop/harbor-android-v4.apk`.

## Travaux réalisés (par thème)

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

### 5. Packaging & docs
- `d15f49f` `bundle.category/shortDescription/longDescription/homepage/publisher` (alimentent .desktop/AppStream Linux, deb/rpm, NSIS Windows, catégorie macOS).
- `5dc996d` / `2a036da` roadmap README mise à jour (platform hardening coché ; statut réel des items ouverts).

## Pièges à connaître (récurrents)
- **Parité stubs mobiles** : toute commande de `generate_handler!` doit avoir un stub `mobile_stubs/<module>.rs`, sinon build Android `E0433`. Vérif rapide : `cargo check --target aarch64-linux-android --lib` (env NDK/CC requis).
- **`.gitignore` global `lib/`** : masquait les nouveaux fichiers sous `src/lib/`. Résolu par `!/src/lib/` dans le `.gitignore` du repo (sinon `git add -f`).
- **Cross-compile impossible depuis macOS** : le code `#[cfg(windows)]`/`#[cfg(linux)]` n'est PAS vérifié par `cargo check` hôte, et cross-check bute sur `libmpv2-sys` (besoin de mpv.lib/X11). **Seule la CI valide Windows/Linux.**
- **CI = seul juge Windows/Linux** : itérer via `gh workflow run tauri-build.yml --ref main` puis lire `gh api repos/elie00/vayra/actions/jobs/<id>/logs`.

## Suivi restant (non bloquant)
- **Linux** : build/packaging finis et verts ; le *polish du lecteur mpv natif* reste à valider sur une vraie machine Linux (rendu vidéo — ne pas modifier sans test de lecture sur plateforme).
- **Windows** : multiview/DVR/vignettes utilisent le `mpv` du PATH tant qu'un `mpv.exe` **vérifié (checksum) et hébergé** n'est pas re-bundlé (ressource retirée dans `c5c7881`). Lecture cœur OK via `libmpv-2.dll` embarquée.
- **AirPlay 2 comme cible de cast** : hors portée (protocole propriétaire SRP/FairPlay + Apple TV requis) ; actuellement détecté et grisé (`airplay2_pairing`).
- **More translations** : ouvert (ajouter d'autres langues au besoin).

## Build / vérif par plateforme
- **Frontend** : `pnpm exec tsc -b && pnpm lint && pnpm test`.
- **Rust desktop** : `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --all-targets -- -D warnings`.
- **Android** : `export PATH="$HOME/.cargo/bin:$PATH" ANDROID_HOME=… NDK_HOME=…/27.3.13750724 JAVA_HOME=/opt/homebrew/opt/openjdk@17` puis `pnpm tauri android build --target aarch64` (APK dans `gen/android/app/build/outputs/apk/universal/release/`).
- **macOS** : `pnpm run tauri:build:macos` (build + bundle libmpv autonome).
- **Windows / Linux** : via CI uniquement (`gh workflow run tauri-build.yml --ref main`).
