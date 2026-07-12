# VAYRA branding compatibility

VAYRA is an independent product by EYBO, built from an autonomous fork of Harbor.
The Harbor references listed here are retained intentionally. They are either attribution,
technical compatibility contracts, or temporary visual assets for which no VAYRA replacement
exists in the repository yet.

This branding pass changes user-facing product copy only. It does not migrate platform identity,
data, playback, casting, the Stremio integration, or collaborative-room protocols.

## Retained compatibility contracts

The following references are internal and must remain stable until a dedicated, tested platform
migration is approved:

- Tauri bundle identifier `app.harbor` and the application data directory derived from it.
- Android namespace and application ID `app.harbor`.
- Flatpak application ID `site.harbor.Harbor`.
- Keyring services `app.harbor` and `app.harbor.auth`.
- Existing `harbor.*` local-storage keys, cache keys, database names, and preference keys.
- Incoming `harbor://` deep links and the existing `stremio://` compatibility path.
- Internal `harbor:*` and `harbor://*` application events, including `harbor:immersive`.
- The public custom-theme bridge `window.harbor` and documented theme APIs built on it.
- CSS classes, CSS variables, animation names, element IDs, and `data-harbor-*` attributes.
- Rust crates and libraries including `harbor-core`, `harbor_lib`, and generated WASM bindings.
- Android JNI classes, native library names, ProGuard rules, and mobile command stubs.
- Internal filenames and exported component names such as `HarborMark` and `HarborLoader`.
- Network homepage, updater endpoint, update signing key, relay endpoints, and deep-link schemes.

These names are not evidence of a second public product identity. They are compatibility surfaces
that existing installations, extensions, themes, links, builds, or stored data may depend on.

## Preserved attribution and legal material

The Harbor fork attribution remains visible and factual. `LICENSE`, third-party notices,
copyright statements, vendored licenses, Git authorship, and repository history must not be
rewritten as product copy. VAYRA attribution supplements those records; it does not replace them.

## Temporary brand debt

### Assets

The approved VAYRA concept-three mark, wordmarks, accent treatment, source icon, and review board
live under `src/assets/brand/vayra/`. The frontend startup mark, loader, README, and Windows
installer artwork now consume this geometry.

Legacy Harbor artwork remains in the repository for attribution, rollback, and compatibility but
is no longer used by the standard VAYRA startup path. Native platform icons under
`src-tauri/icons/` remain temporary Harbor-derived assets until a separately approved icon
generation phase; their replacement must use `vayra-icon-source-1024.png` and validate every
platform package.

### Component and file names

Names such as `HarborMark`, `HarborLoader`, `harbor-loader.tsx`, `ask-harbor.tsx`, and
`harbor-core-wasm.d.ts` remain internal. Renaming them provides no user-facing benefit in this
pass and would create unnecessary import and integration churn.

### CSS, DOM, and theme APIs

Selectors and APIs containing `harbor` remain unchanged. Custom themes may depend on them, so a
future rename requires aliases, deprecation notices, compatibility tests, and a multi-release
transition rather than a global search-and-replace.

### Platform identifiers

Bundle IDs, Android and Flatpak IDs, keyring services, deep links, local-storage keys, native
library names, and updater configuration remain Harbor-derived. They may only change as part of
a platform migration that covers signing, upgrades, rollback, and data recovery.

### Runtime metadata and protocol labels

Some retained Harbor strings are deliberately not user-interface copy: network User-Agent values,
DLNA and Roku protocol metadata, the mpv title used by native window detection, the physical
`Pictures/Harbor` and `Harbor DVR` directories, the Stremio callback app name, and diagnostic log
prefixes. Changing them belongs to protocol or data migration work and is outside this branding
pass. User-facing descriptions refer to VAYRA without changing those contracts.

## Requirements for a future platform migration

Every future migration must be validated in both of these scenarios:

1. A clean VAYRA installation with no Harbor data on the device.
2. An existing Harbor installation containing settings, authentication, addons, profiles,
   history, themes, sessions, caches, and registered deep links.

Migration must be non-destructive. It must read legacy data before writing new data, preserve
old keyring entries and local files until verification succeeds, keep compatibility aliases where
external callers may still use them, and document rollback. Player, cast, HDR, shaders, Stremio,
and collaborative playback require their existing manual playback checks before any related
technical identifier is changed.
