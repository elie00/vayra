# VAYRA — Compte rendu de la reconstruction Harbor → VAYRA

**Produit :** VAYRA · *A product by EYBO* · fork autonome de Harbor (`elie00/vayra`, remote `origin`).
**État :** livré sur `main` (`ad3f0aa`), tag `vayra-identity-v1`. Toutes les branches alignées sur `main`.

Ce document remplace l'ancien recap A/B/C. Il couvre les deux vagues du rebrand :
la **passe visible** (copy + icônes) puis la **reconstruction profonde de l'identité technique**.
Le détail des identifiants conservés vs migrés est dans `docs/branding-compatibility.md`.

---

## 1. Vague 1 — Rebrand visible (déjà sur main avant cette session)

- **Copy produit** : toute la copy utilisateur passée en VAYRA (locales, onboarding, écrans).
- **Icônes** : 50 icônes de plateforme régénérées depuis `vayra-icon-source-1024.png` ; icône macOS **squircle native** (`icon.icns` dédié).
- **Copy réseau produit-visible** : `appName` du consentement Stremio et `X-Title` des API IA → VAYRA. Identité de transport réseau (User-Agent, AGENT AllDebrid) **gardée** (non visible).
- **CI** : artefacts renommés `harbor-*` → `vayra-*`.

## 2. Vague 2 — Reconstruction profonde de l'identité technique

Objectif : renommer les identifiants **internes** Harbor → VAYRA, pas un simple `find/replace` mais une reconstruction avec **migrations de données réelles**. Menée en 10 phases (branche `brand/vayra-identity`, micro-commits, du plus sûr au plus risqué).

| # | Phase | Type | Commit |
|---|---|---|---|
| 1 | DOM `data-harbor-*` → `data-vayra-*` (alias `[data-harbor-nav]` gardé) | interne | `b84c3da` |
| 2 | Événements `harbor:*` / `harbor://*` → `vayra:*` (emit+listen appariés) | interne | `74cee9d` |
| 3 | `window.harbor` → `window.vayra` (+ **alias permanent** pour thèmes users) | interne | `5072f44` |
| 4 | Labels de fenêtre `harbor-pip/modal/hdr` → `vayra-*` (+ capabilities) | interne | `62a59a7` |
| 5 | Commandes IPC `harbor_*` → `vayra_*` (fn Rust + handler + `invoke`) | interne | `ab95c4c` |
| 6 | Crate `harbor-core` → `vayra-core` + package WASM | build | `508cf54` |
| — | Fix workflows CI (chemin du crate renommé) | ci | `11c93d2` |
| 7 | Deep-link : **`vayra://` ajouté** (`harbor://` gardé, additif) | compat | `9c3d948` |
| 8+9 | Bundle/package `app.harbor` → `app.vayra` (desktop + Android + Flatpak) + **migrations keyring/settings** | rupture, migré | `c9d065c` |
| 10 | Formats : écrit `.vayrastyle`/`.vayrx`, **lit toujours** `.harborstyle`/`.harbx` | compat | `f731103` |
| — | Réconciliation docs + CI Android + carry-over + updater | ci/docs | `ffd6194`, `ea461b1`, `d02defc` |

### Contrats cross-frontière déplacés en lockstep
JS `invoke` ↔ Rust `#[command]` · Rust `emit` ↔ JS `listen` · Kotlin package ↔ symboles JNI `Java_app_*` ↔ `System.loadLibrary` · crate ↔ import WASM · labels de fenêtre Rust ↔ `main.tsx` · keyring write ↔ read · extensions write ↔ read.

## 3. Migrations (desktop non destructif)

- **Keyring** : lit `app.vayra` d'abord, sinon **dual-read** de `app.harbor`/`app.harbor.auth` puis **copy-forward** (les anciennes entrées ne sont jamais supprimées — filet de rollback). → credentials préservés.
- **settings.json** : recopié depuis l'ancien data-dir `app.harbor` au 1er lancement.
- **Formats** : `.harborstyle` et `harbor-backup` `.harbx` toujours lus (dual-read).

## 4. Conservé « Harbor » volontairement

- **Serveurs externes** (infra réelle, hors repo) : `harbor.site` + sous-domaines (`app.`/`pub.`/`bugs.`), endpoint updater, `bugs@harbor.site`. → à migrer plus tard.
- **Compat** : scheme `harbor://` (gardé à côté de `vayra://`, liens/QR toujours en `harbor://`) ; préfixe localStorage `harbor.` + clés ; `window.harbor` alias ; classes CSS publiques `.harbor-*`.
- **Interne invisible** : `harbor_lib` (nom `.so`), crate `harbor`, classes Kotlin `HarborCredentials`/`HarborExoBridge`, composants `HarborMark`/`HarborLoader`.
- **Transport/données** : User-Agent réseau, `AGENT` AllDebrid, dossiers `Pictures/Harbor` + `Harbor DVR`, scheme `stremio://`.

## 5. Validation

| Cible | Statut |
|---|---|
| Desktop Windows / macOS / Linux | ✅ CI `tauri-build.yml` verte (artefacts `vayra-*`) |
| Android aarch64 | ✅ build local (APK `applicationId app.vayra`, JNI + loadLibrary) **et** CI `android-build.yml` (nouvelle, ajoutée cette session) |
| Frontend / Rust | ✅ `tsc -b`, `cargo check`, WASM smoke — verts à chaque phase |

## 6. Limites connues (couvertes / documentées)

- **localStorage desktop** (thèmes/progression) **ne migre pas** au changement d'identifier → chemin officiel = **backup/restore `.harbx`** (dual-read Phase 10 lit les anciens backups).
- **Android = réinstall** (applicationId change) → même carry-over backup/restore.
- **Updater / MàJ en place** : 1re install VAYRA = nouvelle app pour l'installeur (Windows MSI), puis auto-updates normaux sous `app.vayra`. Crossover manuel non testable en CI.

## 7. État git final

- `main` = `ad3f0aa` — reconstruction mergée (`--no-ff`), tag **`vayra-identity-v1`**.
- Branches alignées sur `main` : `mobile-android`, `brand/product-identity`, `brand/vayra-identity`, `session-improvements`.
- Branche `brand/completion` (vague 1) mergée et supprimée précédemment.

## 8. Suite possible

- Migrer les endpoints externes `harbor.site` + `bugs@harbor.site` (domaine/serveur réel) quand l'infra VAYRA sera prête.
- À terme, basculer la **génération** des liens/QR de `harbor://` vers `vayra://` une fois le parc mis à jour.
- Optionnel : renommer les identifiants internes invisibles restants (`harbor_lib`, crate `harbor`, classes Kotlin) — sans bénéfice utilisateur, churn pur.
