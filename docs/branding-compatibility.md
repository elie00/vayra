# VAYRA branding & identity

VAYRA is an independent product by EYBO, built from an autonomous fork of Harbor.

The visible product is fully VAYRA. Beyond the user-facing copy pass, a deep
technical-identity reconstruction (branch `brand/vayra-identity`) renamed the
internal Harbor identifiers to VAYRA as well, with data-preserving migrations.
The Harbor references that remain are listed here and are intentional: they are
attribution, external servers outside this repo, or backward-compatibility
surfaces kept so existing installs, links, themes and files keep working.

## Reconstructed to VAYRA

These identifiers were migrated from Harbor to VAYRA, each moving both ends of
every cross-boundary contract in lockstep:

- Desktop bundle identifier `app.harbor` → `app.vayra` (`tauri.conf.json`).
- Android namespace + applicationId `app.harbor` → `app.vayra`; the hand-written
  Kotlin sources moved to `app/vayra/`; the JNI symbols regenerate from the new
  package; `Theme.harbor` → `Theme.vayra`.
- Flatpak application ID `site.harbor.Harbor` → `site.vayra.Vayra` (manifest,
  metainfo, desktop entry, scripts, CI).
- Keyring services `app.harbor` / `app.harbor.auth` → `app.vayra` / `app.vayra.auth`.
- Rust WASM crate `harbor-core` → `vayra-core` (+ `vayra_core_version`, imports,
  WASM package, build scripts).
- Tauri IPC command names `harbor_*` → `vayra_*` (fn + `generate_handler!` + JS
  `invoke`).
- Window labels `harbor-pip` / `harbor-modal-overlay` / `harbor-hdr-overlay` →
  `vayra-*` and their `?vayra-modal` / `?vayra-overlay` URL params.
- Internal DOM/Tauri event names `harbor:*` / `harbor://*` → `vayra:*` / `vayra://*`.
- Internal DOM attributes `data-harbor-*` → `data-vayra-*`.
- Global theming API `window.harbor` → `window.vayra` (see alias below).
- Deep-link scheme: `vayra://` is now registered and accepted (see `harbor://` below).
- User file formats: exports now write `.vayrastyle` and `vayra-backup*.vayrx`.

## Data-preserving migrations

The identity change is non-destructive on desktop:

- **Keyring** — reads the new `app.vayra` service first and, when absent, reads
  the legacy `app.harbor` / `app.harbor.auth` entry and copies it forward. Legacy
  entries are never modified or deleted (rollback safety net).
- **settings.json** — on first launch under the new identifier, copied forward
  from the legacy `app.harbor` application-data directory when the new one is empty.
- **File formats** — `.harborstyle` and legacy `harbor-backup` `.harbx` files are
  still read; only the write side emits the VAYRA-branded extensions.

**Known non-migration:** WebView-managed `localStorage` (themes, watch progress,
and the many `harbor.*` keys) lives in bundle-id-keyed storage and does **not**
carry over when the desktop identifier changes. Users should export a backup
before updating. On **Android**, an `applicationId` change is a fresh install:
app-private credentials and storage do not migrate (re-login / re-add API keys).

## Retained Harbor references (intentional)

### External servers (outside this repo)

`harbor.site` and its subdomains (`app.harbor.site`, `pub.harbor.site`,
`bugs.harbor.site`), the updater endpoint, update signing, and the support email
`bugs@harbor.site` are real running infrastructure. They are left unchanged and
will be migrated separately.

### Backward-compatibility surfaces

- `harbor://` deep links stay registered and accepted alongside `vayra://`, and
  QR/invite links are still generated as `harbor://` so links shared with older
  installs keep resolving.
- The `harbor.` `localStorage` prefix and all `harbor.*` / `harbor:*` storage keys
  are kept so existing user state and legacy `.harbx` restores keep working.
- `.harborstyle` and `harbor-backup` `.harbx` files remain readable (dual-read).
- `window.harbor` is kept permanently as an alias of `window.vayra`, and the
  public `.harbor-*` CSS theming classes and the `[data-harbor-nav]` selector are
  preserved (aliased) so user-authored themes keep matching.
- Legacy keyring services `app.harbor` / `app.harbor.auth` are read for the
  one-time credential migration described above.

### Internal names with no user-facing value in renaming

- The native library name `harbor_lib` (`[lib]` name; `System.loadLibrary`
  regenerates to match) and the `src-tauri` crate name `harbor`.
- Kotlin class names `HarborCredentials`, `HarborExoBridge`, `MainActivity`
  (only their package moved to `app.vayra`).
- Component/file names such as `HarborMark`, `HarborLoader`, `harbor-loader.tsx`,
  `ask-harbor.tsx`.
- The orphan `harbor://cycle-theme` listener (no emitter exists).

### Network / data-location contracts

Network transport strings — the anime-fillers `User-Agent` and the AllDebrid
`AGENT` value — and the physical `Pictures/Harbor` and `Harbor DVR` directories
are protocol/data contracts kept as-is. The `stremio://` scheme is a foreign
ecosystem contract and is unchanged.

## Preserved attribution and legal material

The Harbor fork attribution remains visible and factual. `LICENSE`, third-party
notices, copyright statements, vendored licenses, Git authorship, and repository
history are records, not product copy, and are not rewritten. VAYRA attribution
supplements them; it does not replace them.

## Validation

Desktop (Windows / macOS / Linux) is validated in CI. Android is not in the
`tauri-build.yml` matrix and requires a separate device or CI build to validate
the package/JNI rename. Player, cast, HDR, shaders, Stremio, and collaborative
playback keep their existing manual playback checks.
