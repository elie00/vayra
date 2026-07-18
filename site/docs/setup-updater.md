# VAYRA updater release channel

The desktop updater is isolated from Harbor and uses the VAYRA-owned endpoint:

```text
https://vayra.eybo.tech/updates/latest.json
```

This endpoint is a serverless gateway to the `latest.json` asset of the latest
public GitHub release. It accepts only manifests whose artifacts belong to
`github.com/elie00/vayra/releases/download/`. Until such a signed release
exists, it returns the current version with an empty `platforms` object, so no
legacy or unsigned update can be offered.

The rollback/history UI reads `https://vayra.eybo.tech/updates/versions.json`.
Before the first public release this catalog is deliberately empty, so no Harbor
installer can be offered to a VAYRA user.

## Signing boundary

The public updater key embedded in `src-tauri/tauri.conf.json` belongs to VAYRA.
Its matching private key is never stored in this repository. CI reads it from:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Both secrets were provisioned in the `elie00/vayra` GitHub repository on
2026-07-18. The maintainer copy is stored outside the repository under
`~/.tauri/vayra.key`; its password is stored in the macOS Keychain service
`vayra-updater-signing`.

Existing development builds that contain Harbor's former updater public key
cannot verify the new VAYRA signatures. The first VAYRA release therefore needs
a manual reinstall. Every subsequent release can update normally through this
channel.

## Publishing a manifest

The signed release workflow uploads updater artifacts, their `.sig` sidecars,
and the generated `latest.json` to the same GitHub Release. For an audited
manual rebuild of that manifest:

```bash
mkdir -p /tmp/vayra-sigs
gh release download v0.9.36 \
  --repo elie00/vayra \
  --pattern '*.sig' \
  --dir /tmp/vayra-sigs

node site/scripts/gen-latest-json.mjs \
  --tag v0.9.36 \
  --sig-dir /tmp/vayra-sigs \
  --out /tmp/vayra-sigs/latest.json \
  --notes "VAYRA 0.9.36"
```

Upload the generated manifest only after every referenced release asset exists.
Never hand-write signatures and never publish placeholder values. The checked-in
`site/public/updates/latest.json` remains the explicit no-update fallback and is
not edited for every release.

## Required checks

1. The manifest version equals the tag and application version.
2. Every URL returns `200` without authentication.
3. Every signature verifies with the public key embedded in the release.
4. A current release reports no update.
5. The previous VAYRA release downloads, verifies and installs the new release.
6. Rollback links point only to `github.com/elie00/vayra/releases`.
