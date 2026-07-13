# Setup: Auto-updater manifest (`/updates/latest.json`)

## What this replaces

The VAYRA desktop app (harbor repo) ships with the Tauri updater plugin
(`tauri-plugin-updater` v2). Its endpoint is configured in
`src-tauri/tauri.conf.json`:

```jsonc
"plugins": {
  "updater": {
    "endpoints": ["https://harbor.site/updates/latest.json"],
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEIyNjlEMjU4NjQ4OTM2MjAK...",
    "windows": { "installMode": "passive" }
  }
}
```

So `harbor.site/updates/latest.json` is the file the app polls (every 6h, plus on
launch and on manual "check for updates"). This project serves that path from
`public/updates/latest.json` on Vercel. When the app's base URL is pointed at this
deployment, updates flow from here.

> Note: there is a SECOND updater file the app uses, `harbor.site/updates/versions-beta.json`
> (read by `src/lib/updater/versions.ts` for the settings "rollback / version history"
> list). That is a different, unsigned catalog and is **out of scope** for this task —
> only `latest.json` (the signed Tauri updater manifest) is handled here.

## The contract this matches (grounded in the app code)

The Tauri updater plugin expects the **"static JSON" server format**. For each running
platform it reads `platforms[<key>]`, downloads `url`, and verifies the download against
`signature` using the minisign **public key** from `tauri.conf.json`.

`public/updates/latest.json` shape:

```jsonc
{
  "version": "0.9.36",            // must be > installed version for an update to trigger
  "notes": "…",                    // shown in the app update card (use-update.ts -> update.body)
  "pub_date": "2026-07-13T00:00:00.000Z",  // RFC3339
  "platforms": {
    "darwin-aarch64":  { "signature": "<contents of .sig>", "url": "https://github.com/elie00/harbor/releases/download/v0.9.36/VAYRA_aarch64.app.tar.gz" },
    "darwin-x86_64":   { "signature": "…", "url": "…VAYRA_x64.app.tar.gz" },
    "linux-x86_64":    { "signature": "…", "url": "…VAYRA_0.9.36_amd64.AppImage" },
    "windows-x86_64":  { "signature": "…", "url": "…VAYRA_0.9.36_x64-setup.exe" }
  }
}
```

- Platform keys are the Tauri targets: `darwin-aarch64`, `darwin-x86_64`,
  `linux-x86_64`, `windows-x86_64`. A platform absent from `platforms` = "no update" for
  that OS/arch (safe to omit).
- `signature` is the **raw text contents** of the `.sig` sidecar that `tauri build`
  produces next to each updater artifact — NOT a path, NOT base64-of-the-file.
- `url` points at the GitHub release asset:
  `https://github.com/elie00/harbor/releases/download/<tag>/<artifact>`.

App-side consumers (for reference, do not edit):
- `src/lib/updater/use-update.ts` — calls `check()` from `@tauri-apps/plugin-updater`,
  uses `update.version` and `update.body` (our `notes`).
- The beta channel sends header `x-harbor-channel: beta` on the request. Our endpoint is
  a static file, so the header is ignored; everyone gets the same `latest.json`. (If you
  later want separate beta/stable manifests, make `latest.json` a serverless function
  that branches on that header.)

## Env vars needed

**None for serving.** `latest.json` is a static file — Vercel serves it with no secrets.

The secret lives in **CI (GitHub Actions), not this site**: signing releases requires the
minisign **private key** that matches the pubkey in `tauri.conf.json`. Store it as a
GitHub Actions secret on the `elie00/harbor` repo:

| Secret | Where it's used | Where to get it |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | harbor CI build step (`tauri-apps/tauri-action` or `tauri build`) | The existing private key file, OR generated via `tauri signer generate` (see Decision below) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | same build step | The password you set when generating/exporting the key (empty string if none) |

Tauri dev portal / docs for the updater + signing:
https://v2.tauri.app/plugin/updater/

## DECISION: how to actually sign VAYRA updates

The updater will **only** install a download whose `signature` verifies against the
`pubkey` embedded in `tauri.conf.json`:

```
minisign public key: B269D25864893620
RWQgNolkWNJpsvCByoeF2/eDXx087Ikgdgle5i7zdV/UtuukqBeVhBXE
```

To produce valid signatures you need the matching **private key**. We do NOT have it, and
this repo will not generate or store one. There are exactly two paths:

### Option A — Use the EXISTING private key (no app change)

If you (or whoever set up harbor.site) still have the private key that pairs with the
pubkey above, use it. No change to `tauri.conf.json` is required — the pubkey already
matches. Just wire the key into CI:

```bash
# On the machine that has the existing key file (default location):
#   macOS/Linux: ~/.tauri/vayra.key   (or wherever you saved it)
# Add it as a GitHub Actions secret on elie00/harbor:
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo elie00/harbor < ~/.tauri/vayra.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo elie00/harbor   # paste the key password (or empty)
```

### Option B — Generate a NEW keypair (REQUIRES a separate app change to approve)

If the old private key is lost, generate a fresh keypair. **This changes the public key,
so `tauri.conf.json` must be updated in the harbor app** — that is a deliberate app change
that must be reviewed/approved separately (this task must not edit the harbor repo).
Consequence: existing installs that were signed with the old key can only auto-update once
they've received a build carrying the new pubkey — plan a bridging release.

```bash
# 1. Generate the keypair (writes vayra.key + vayra.key.pub, prompts for a password):
npm run tauri signer generate -- -w ~/.tauri/vayra.key
#   -> prints the PUBLIC key (base64). Copy it.

# 2. In the harbor repo (SEPARATE, APPROVED CHANGE — not done here):
#    set src-tauri/tauri.conf.json -> plugins.updater.pubkey = "<the new public key>"

# 3. Store the PRIVATE key + password as GitHub Actions secrets on elie00/harbor:
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo elie00/harbor < ~/.tauri/vayra.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo elie00/harbor
```

> Never commit `vayra.key` (the private key) to any repo. It only belongs in the GitHub
> Actions secret store and on the maintainer's machine.

### CI: build with signing enabled

With the secret in place, the harbor build job signs artifacts when these env vars are set
(this is a harbor CI change, shown here for completeness):

```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

`tauri build` then emits, next to each artifact, a `.sig` file, e.g.
`VAYRA_aarch64.app.tar.gz.sig`. (Note: harbor's `tauri.conf.json` currently has
`bundle.createUpdaterArtifacts: false` — set it to `true`, or rely on the signing env vars,
so the `.tar.gz`/updater artifacts + `.sig` files are produced. That is also a harbor change.)

## Regenerating `latest.json` for a release

Once a release tag exists on GitHub with the signed artifacts + `.sig` files uploaded:

```bash
# 1. Download the .sig sidecars from the release into a folder:
mkdir -p /tmp/vayra-sigs
gh release download v0.9.36 --repo elie00/harbor --pattern '*.sig' --dir /tmp/vayra-sigs

# 2. Generate the manifest into this site's public/ dir:
node scripts/gen-latest-json.mjs \
  --tag v0.9.36 \
  --sig-dir /tmp/vayra-sigs \
  --notes "What's new in 0.9.36…"

# 3. Commit public/updates/latest.json and deploy to Vercel.
```

The script (`scripts/gen-latest-json.mjs`) maps each `.sig` to its default Tauri v2
artifact name and GitHub download URL, inlines the signature text, and writes
`public/updates/latest.json`. Platforms whose `.sig` is missing are omitted with a warning.
If your CI renames artifacts, adjust the `PLATFORMS` table at the top of the script.
