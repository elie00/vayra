# VAYRA Infrastructure Setup

Master setup guide for the VAYRA-hosted replacements of every backend service the Harbor
desktop app used to call on `harbor.site` (and a couple of sibling hosts:
`bugs.harbor.site`, `pub.harbor.site`).

This repo (`vayra-site`) is a Vercel project. Some replacements are **static files** under
`public/` (live the moment they deploy, no secret). Others are **Vercel serverless
functions** under `api/` that need a provider secret before they do anything useful; until
the secret is set they deploy fine but return `501 {error:"not configured", needs:...}`.

Per-service detail lives in `docs/setup-*.md`; this file is the index + the operational
runbook (accounts to register, env vars, updater keys, and the re-pointing plan).

---

## 1. Service map — what replaces each `harbor.site` endpoint

Status legend: **LIVE** = works as soon as it deploys, no secret required. **NEEDS SECRET**
= deploys but is inert (501 or empty) until the listed env var(s) are set.

| Original endpoint (app called) | Replacement in this repo | Type | Status | Secret(s) required |
|---|---|---|---|---|
| Trakt token refresh (`TRAKT_TOKEN_PROXY`) | `api/trakt/token.js` | serverless | **NEEDS SECRET** | `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET` |
| Trakt device-token poll (`TRAKT_DEVICE_TOKEN_PROXY`) | `api/trakt/device-token.js` | serverless | **NEEDS SECRET** | `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET` |
| MAL token exchange (`MAL_TOKEN_PROXY`) | `api/mal/token.js` | serverless | **NEEDS SECRET** | `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`, `MAL_REDIRECT_URI` |
| AniList token exchange (`ANILIST_TOKEN_EXCHANGE_URL`, was `bugs.harbor.site/v1/anilist/token`) | `api/anilist/token.js` | serverless | **NEEDS SECRET** | `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET` |
| TVDB v4 API (`harbor.site/tvdb/v4/*`) | `api/tvdb/v4/[...path].js` (+ `api/_lib/tvdb.js`) | serverless | **NEEDS SECRET** | `TVDB_API_KEY` |
| TVDB episode images (`harbor.site/tvdb/images`) | `api/tvdb/images.js` | serverless | **NEEDS SECRET** | `TVDB_API_KEY` |
| TVDB artwork (`harbor.site/tvdb/artwork`) | `api/tvdb/artwork.js` | serverless | **NEEDS SECRET** | `TVDB_API_KEY` |
| IMDb metadata (`harbor.site/imdb/*`) | `api/imdb/[...path].js` | serverless | **LIVE** (keyless GraphQL) | `IMDB_API_KEY`, `IMDB_API_BASE` (both **optional**) |
| Feedback intake (`harbor.site/v1/feedback`) | `api/v1/feedback.js` | serverless | **NEEDS SECRET** | `FEEDBACK_WEBHOOK_URL` |
| Ad-report intake (`harbor.site/v1/adreport`) | `api/v1/adreport.js` | serverless | **NEEDS SECRET** | `FEEDBACK_WEBHOOK_URL` |
| Hosted hero (`harbor.site/api/hero/anime.json`) | `public/api/hero/anime.json` | static | **LIVE** | none |
| Skip-intro ad corpus (`harbor.site/updates/ad-segments.json`) | `public/updates/ad-segments.json` | static | **LIVE** (empty corpus) | none* |
| Theme catalog (`harbor.site/themes/api/themes`) | `public/themes/api/themes/index.json` (+ `vercel.json` rewrite) | static | **LIVE** (empty catalog) | none |
| Discord Rich Presence images (`harbor.site/discord/*`) | `public/discord/*.png` (placeholders) | static | **LIVE** | none |
| Tauri auto-updater manifest (`harbor.site/updates/latest.json`) | `public/updates/latest.json` (+ `scripts/gen-latest-json.mjs`) | static | **LIVE** (template — inert until real signatures filled in) | `TAURI_SIGNING_PRIVATE_KEY`(+ password)** |
| Watch-party public relay (`pub.harbor.site`) | — (docs only, see `docs/setup-relay.md`) | n/a | **LIVE** (users self-host) | none |

Footnotes:
- `*` The ad-segments corpus is Ed25519-signed against a pubkey baked into the app. We do
  **not** hold the private signing key, so an empty `{}` (which the client safely reads as
  `[]`) is the only correct static response. Populating it would require that private key.
- `**` The updater **manifest** is a static file and needs no secret to serve. The
  `TAURI_SIGNING_PRIVATE_KEY` is **not** a Vercel secret — it lives as a GitHub Actions
  secret on the `elie00/vayra` build repo and is used only when generating per-release
  signatures. See §4.

### LIVE-now vs NEEDS-SECRET at a glance

- **LIVE the moment you deploy (no action):** IMDb proxy, hosted hero, ad-segments, theme
  catalog, Discord images, updater manifest template, watch-party relay (self-hosted by
  users).
- **Deploys but inert until you set a secret:** all Trakt/MAL/AniList OAuth proxies, all
  three TVDB endpoints, feedback + ad-report intake.

---

## 2. Accounts / dev-apps to register (ordered checklist)

Do these in order. Each row ends with the **exact env var name(s)** the registration
produces — you'll paste those into Vercel in §3.

- [ ] **1. Trakt API app** — register at <https://trakt.tv/oauth/applications>.
      Redirect URI: `urn:ietf:wg:oauth:2.0:oob`.
      → produces `TRAKT_CLIENT_ID` and `TRAKT_CLIENT_SECRET`.

- [ ] **2. MyAnimeList API app** — create a web app at <https://myanimelist.net/apiconfig>.
      Registered redirect URL must match the app's build value (Harbor default:
      `https://harbor.site/mal/`).
      → produces `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`, and the value you set for
      `MAL_REDIRECT_URI` (must equal both the app build value and the MAL app's registered
      redirect URL).

- [ ] **3. AniList client** — create at <https://anilist.co/settings/developer>.
      Redirect URL: `https://anilist.co/api/v2/oauth/pin`.
      → produces `ANILIST_CLIENT_ID` and `ANILIST_CLIENT_SECRET`.

- [ ] **4. TheTVDB v4 API key** — register (free account) at
      <https://thetvdb.com/dashboard/account/apikey>. Used server-side to `POST /v4/login`
      and attach the bearer token to every TVDB call.
      → produces `TVDB_API_KEY`. (Powers all three TVDB endpoints at once.)

- [ ] **5. (Optional) IMDb gateway** — only if you want to front IMDb through a
      paid/authenticated provider (e.g. a RapidAPI IMDb provider, or IMDb data licensing at
      <https://developer.imdb.com/>). Not needed for the default keyless IMDb GraphQL source.
      → produces optional `IMDB_API_KEY` (forwarded as Bearer) and/or `IMDB_API_BASE`
      (overrides the GraphQL endpoint, default `https://api.graphql.imdb.com/`).

- [ ] **6. (Optional) Feedback webhook** — create **one** of:
      a Discord Incoming Webhook (Server → Channel settings → Integrations → Webhooks → New
      Webhook → Copy URL, docs
      <https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks>), **or**
      a Slack Incoming Webhook (<https://api.slack.com/messaging/webhooks>).
      → produces `FEEDBACK_WEBHOOK_URL` (one var powers both feedback + ad-report; the
      endpoints send both `{content}` and `{text}` so either webhook type works).

- [ ] **7. (Optional) Cloudflare — watch-party relay.** Nothing to register on VAYRA's side.
      Users self-host their own relay from inside the app (Settings → VAYRA Relay → Deploy a
      relay) using a Cloudflare API token they create at
      <https://dash.cloudflare.com/profile/api-tokens> (permission: Workers Scripts:Edit).
      That token stays on the user's device (`settings.togetherCfToken`) and is sent only to
      Cloudflare — **no VAYRA env var**. Standing up a shared public relay to replace the
      `wss://pub.harbor.site` fallback is out of scope (needs a persistent Worker **and** a
      one-line edit in the harbor repo). See `docs/setup-relay.md`.

- [ ] **8. (Only if you'll ship app updates) Tauri updater signing key** — not a web signup;
      see §4. → produces `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
      as **GitHub Actions secrets on `elie00/vayra`**, not Vercel env vars.

### All env vars, by where they live

**Vercel project env vars** (this repo):

| Var | Required? | For |
|---|---|---|
| `TRAKT_CLIENT_ID` | required for Trakt | `api/trakt/*` |
| `TRAKT_CLIENT_SECRET` | required for Trakt | `api/trakt/*` |
| `MAL_CLIENT_ID` | required for MAL | `api/mal/token.js` |
| `MAL_CLIENT_SECRET` | required for MAL | `api/mal/token.js` |
| `MAL_REDIRECT_URI` | required for MAL | `api/mal/token.js` |
| `ANILIST_CLIENT_ID` | required for AniList | `api/anilist/token.js` |
| `ANILIST_CLIENT_SECRET` | required for AniList | `api/anilist/token.js` |
| `TVDB_API_KEY` | required for TVDB | all `api/tvdb/*` |
| `IMDB_API_KEY` | optional | `api/imdb/*` |
| `IMDB_API_BASE` | optional | `api/imdb/*` |
| `FEEDBACK_WEBHOOK_URL` | required for feedback/adreport | `api/v1/feedback.js`, `api/v1/adreport.js` |

**GitHub Actions secrets on `elie00/vayra`** (NOT Vercel):

| Var | Required? | For |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | required to sign releases | generating `updates/latest.json` signatures |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | required (empty string if none) | same |

**On each user's device only** (never a VAYRA secret): the Cloudflare API token for the
self-hosted relay.

---

## 3. Setting env vars on Vercel

All `api/*` secrets are read from `process.env` only — never hardcode. Set them either way:

### Option A — Vercel dashboard
1. Open the project → **Settings** → **Environment Variables**.
2. Add each var (name + value). Select the environments (Production / Preview /
   Development) it should apply to.
3. **Redeploy** — env var changes only take effect on a new deployment.

### Option B — Vercel CLI

```bash
# from the repo root, once per variable
vercel env add TRAKT_CLIENT_ID production
# (paste the value when prompted; repeat for preview/development as needed)

vercel env add TRAKT_CLIENT_SECRET production
vercel env add MAL_CLIENT_ID production
vercel env add MAL_CLIENT_SECRET production
vercel env add MAL_REDIRECT_URI production
vercel env add ANILIST_CLIENT_ID production
vercel env add ANILIST_CLIENT_SECRET production
vercel env add TVDB_API_KEY production
vercel env add FEEDBACK_WEBHOOK_URL production
# optional:
vercel env add IMDB_API_KEY production
vercel env add IMDB_API_BASE production

# then trigger a fresh deploy so the vars load
vercel --prod
```

Verify a value is set (name only, not the secret) with `vercel env ls`.

Quick sanity check after deploy: an unconfigured serverless endpoint returns
`501 {"error":"not configured","needs":"..."}`, so you can `curl` an endpoint to confirm
whether its secret took effect.

---

## 4. Updater keypair decision

The Tauri updater (`plugins.updater` in harbor `src-tauri/tauri.conf.json`) pins a minisign
public key `B269D25864893620` and points at `https://harbor.site/updates/latest.json`. The
plugin verifies every release's signature against that pubkey. Two paths:

- **Option A — reuse the existing private key (recommended).** Obtain the minisign private
  key that matches pubkey `B269D25864893620` from the current key holder. **No app change**:
  the pinned pubkey stays valid, existing installs keep auto-updating.

- **Option B — generate a new key** with `tauri signer generate`. This produces a **new**
  pubkey, so it **requires a separate approved change in the harbor repo** (update the
  `tauri.conf.json` pubkey) plus a bridging release signed with the old key so current
  installs can cross over. More disruptive — only if the old key is truly unavailable.

Store the chosen private key as GitHub Actions secrets **on `elie00/vayra`** (the build
repo), not on this site:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo elie00/vayra
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo elie00/vayra   # empty string if none
```

Producing the live manifest: `public/updates/latest.json` currently ships as a **template**
(version 0.9.36, GitHub-release asset URLs, `REPLACE_WITH_CONTENTS_OF_*.sig` placeholders) —
it deploys but is inert until real per-platform signatures are inlined. Generate the real
one per release with the committed script:

```bash
# download the .sig sidecars produced by the signed build, then:
gh release download v0.9.36 --repo elie00/vayra --pattern '*.sig' --dir ./sigs
node scripts/gen-latest-json.mjs --tag v0.9.36 --sig-dir ./sigs
# writes public/updates/latest.json with signatures inlined for
# darwin-aarch64 / darwin-x86_64 / linux-x86_64 / windows-x86_64
```

Note: harbor's `createUpdaterArtifacts` is currently `false`, so the signed `.sig` artifacts
must be produced by the release build before this manifest can be completed. The
`versions-beta.json` rollback catalog is a separate, unsigned file and is out of scope here.
Full detail: `docs/setup-updater.md`.

---

## 5. Re-pointing the app from `harbor.site` to VAYRA

**Hard rule: do NOT re-point any endpoint until its VAYRA replacement is actually deployed
and confirmed serving.** Re-pointing to an endpoint that returns 501 (unconfigured secret)
or an empty payload will silently break that feature in shipped apps. Verify each endpoint
(e.g. `curl` returns the expected contract, not a 501) **before** editing the app.

These constants/URLs live in the **harbor app repo** (this `vayra-site` repo does not
contain them — no harbor files were edited by this setup). Re-point each only after its
replacement is green:

| App-side reference | Re-point to (once live) | Gate before re-pointing |
|---|---|---|
| `TRAKT_TOKEN_PROXY` | `https://<vayra-domain>/trakt/token` | Trakt secrets set, endpoint not 501 |
| `TRAKT_DEVICE_TOKEN_PROXY` | `https://<vayra-domain>/trakt/device-token` | Trakt secrets set |
| `MAL_TOKEN_PROXY` | `https://<vayra-domain>/mal/token` | MAL secrets set; `MAL_REDIRECT_URI` matches the app build value + MAL app registration |
| `ANILIST_TOKEN_EXCHANGE_URL` (was `bugs.harbor.site/v1/anilist/token`) | `https://<vayra-domain>/anilist/token` | AniList secrets set |
| TVDB base (`harbor.site/tvdb/*`) | `https://<vayra-domain>/tvdb/*` | `TVDB_API_KEY` set; `/tvdb/v4/...` returns data, not 501 |
| IMDb base (`harbor.site/imdb/*`) | `https://<vayra-domain>/imdb/*` | already live (keyless) — still confirm it serves |
| Feedback/adreport (`harbor.site/v1/*`) | `https://<vayra-domain>/v1/feedback`, `/v1/adreport` | `FEEDBACK_WEBHOOK_URL` set |
| Hosted hero, ad-segments, theme catalog, Discord images, updater `updates/latest.json` | `https://<vayra-domain>/...` (same paths) | static — live on deploy; for the **updater**, only re-point after real signatures are inlined (§4), else installs get an unverifiable manifest |
| `HARBOR_PUBLIC_RELAY` = `wss://pub.harbor.site` | leave as-is | out of scope; changing the default fallback needs a hosted Worker **and** a harbor-repo edit (see `docs/setup-relay.md`). Users self-hosting a relay are unaffected. |

Notes on the MAL redirect URI: because `MAL_REDIRECT_URI` must match **three** places (the
app's build value, the MAL app's registered redirect URL, and the Vercel env var), changing
the redirect requires coordinating all three or MAL token exchange will fail.

---

## 6. Per-service reference docs

- `docs/setup-oauth-proxies.md` — Trakt / MAL / AniList token proxies (contracts, provider
  registration, redirect URIs).
- `docs/setup-tvdb.md` — TVDB v4 pass-through, images, artwork.
- `docs/setup-imdb.md` — IMDb GraphQL proxy (keyless default + optional gateway override).
- `docs/setup-feedback.md` — feedback + ad-report intake (webhook forwarding).
- `docs/setup-static.md` — hero, ad-segments, theme catalog, Discord images.
- `docs/setup-updater.md` — Tauri updater manifest + signing key decision.
- `docs/setup-relay.md` — watch-party relay (self-host flow + why the public fallback is out
  of scope).

---

## 7. Deployment posture summary

- Deploying this repo **today, with zero secrets**, already brings up: IMDb metadata, hosted
  hero (empty), ad-segments (empty), theme catalog (empty), Discord placeholder images, and
  the updater manifest template. Every OAuth/TVDB/feedback endpoint deploys too but answers
  501 until its secret is set.
- Set the §2 secrets in Vercel (§3), redeploy, then confirm each endpoint serves its real
  contract before re-pointing the app (§5).
- The updater and watch-party relay are the two special cases: the updater needs a signing
  **key** handled on the harbor build repo (§4), and the public relay is intentionally not
  provided (users self-host).

No harbor repo files were modified, no secrets were generated or committed, and no
git commit/push was performed as part of this setup.
