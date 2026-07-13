# OAuth token proxies (Trakt, MyAnimeList, AniList)

These serverless functions replace the OAuth token-exchange endpoints the Harbor
desktop app used to call on `harbor.site` / `bugs.harbor.site`. Their whole job is
to keep each provider's **client secret** off the desktop app: the app sends an
auth code (or refresh token), the proxy adds the secret server-side, forwards to
the provider, and returns the same JSON the app already expects.

Set every secret as a Vercel Environment Variable (Project → Settings →
Environment Variables). If a required secret is missing, the endpoint returns
`501 { "error": "not configured", "needs": "<ENV_NAMES>" }` — it deploys but stays
inert until configured.

You must register **new** dev apps at each provider (do not reuse Harbor's
credentials). When registering, use the redirect URIs listed below so the codes
your app mints are valid for these proxies.

---

## 1. Trakt

Two endpoints, both replacing `https://harbor.site/api/trakt/...`.

| Endpoint | File | Replaces |
|---|---|---|
| `POST /api/trakt/token` | `api/trakt/token.js` | `TRAKT_TOKEN_PROXY` |
| `POST /api/trakt/device-token` | `api/trakt/device-token.js` | `TRAKT_DEVICE_TOKEN_PROXY` |

### Env vars
- `TRAKT_CLIENT_ID`
- `TRAKT_CLIENT_SECRET`

### Where to register
Trakt API apps: https://trakt.tv/oauth/applications → **New Application**.
- Copy the **Client ID** and **Client Secret** into the env vars above.
- Redirect URI: set `urn:ietf:wg:oauth:2.0:oob` (device / PIN flow). This app
  uses the device-code flow, so no browser redirect back to the site is needed.

### Contract matched

`POST /api/trakt/token` (refresh only — the only way the client calls it, from
`src/lib/trakt/client.ts` → `refreshAccessToken`):
- Request JSON: `{ "refresh_token": "...", "grant_type": "refresh_token" }`
- Proxy forwards to `https://api.trakt.tv/oauth/token` adding
  `client_id`, `client_secret`, `redirect_uri` (OOB).
- Response 200 JSON (passed through): `{ access_token, refresh_token, created_at, expires_in }`
- On failure the upstream status/body is passed through (client treats `!ok` as
  "clear session").

`POST /api/trakt/device-token` (poll loop, `src/lib/trakt/device-auth.ts` →
`pollOnce`):
- Request JSON: `{ "code": "<device_code>" }`
- Proxy forwards to `https://api.trakt.tv/oauth/device/token` adding
  `client_id`, `client_secret`.
- **Status codes are passed through unchanged** because the client's state machine
  branches on them: `200` authorized · `400` pending · `429` slow_down ·
  `410` expired · `418` denied.
- 200 body: `{ access_token, refresh_token, created_at, expires_in }`

---

## 2. MyAnimeList (MAL)

| Endpoint | File | Replaces |
|---|---|---|
| `POST /api/mal/token` | `api/mal/token.js` | `MAL_TOKEN_PROXY` |

### Env vars
- `MAL_CLIENT_ID`
- `MAL_CLIENT_SECRET`
- `MAL_REDIRECT_URI` — must exactly match the `MAL_REDIRECT_URI` the desktop app
  is built with (Harbor default: `https://harbor.site/mal/`). Set this to the same
  value your app uses, and register that URI on the MAL app below. Only used for
  the `authorization_code` exchange.

### Where to register
MAL API config: https://myanimelist.net/apiconfig → **Create ID**.
- App Type: **web**. Copy **Client ID** and **Client Secret**.
- App Redirect URL: the value you put in `MAL_REDIRECT_URI`.

### Contract matched
`src/lib/mal/auth.ts` calls this proxy for two grant types with a **JSON** body;
MAL's real endpoint wants `x-www-form-urlencoded`, so the proxy converts it and
injects `client_id` + `client_secret` (+ `redirect_uri` for the code exchange).

- Authorization code (`exchangeCode`):
  Request JSON `{ "grant_type": "authorization_code", "code": "...", "code_verifier": "..." }`
  (PKCE `code_challenge_method=plain`, so verifier == challenge).
- Refresh (`refreshAccessToken`):
  Request JSON `{ "grant_type": "refresh_token", "refresh_token": "..." }`
- Forwards to `https://myanimelist.net/v1/oauth2/token`.
- Response 2xx JSON (passed through): `{ access_token, refresh_token, expires_in }`
- On failure upstream status/body is passed through (client reads `res.text()`).

---

## 3. AniList

| Endpoint | File | Replaces |
|---|---|---|
| `POST /api/anilist/token` | `api/anilist/token.js` | `ANILIST_TOKEN_EXCHANGE_URL` |

> Note: the Harbor client currently points `ANILIST_TOKEN_EXCHANGE_URL` at
> `https://bugs.harbor.site/v1/anilist/token`. When the app's base URL is
> repointed here it should map to `/api/anilist/token` (this file). The request/
> response contract is identical.

### Env vars
- `ANILIST_CLIENT_ID`
- `ANILIST_CLIENT_SECRET`

### Where to register
AniList developer settings: https://anilist.co/settings/developer → **Create New Client**.
- Copy the **Client ID** (numeric) and **Client Secret**.
- Redirect URL: `https://anilist.co/api/v2/oauth/pin` — this is AniList's built-in
  PIN page (`ANILIST_PIN_REDIRECT_URI`), which shows the user a code to paste. The
  proxy uses this same `redirect_uri` in the exchange, so it must match.

### Contract matched
`src/lib/anilist/auth.ts` → `exchangeCode`:
- Request JSON: `{ "code": "<pasted code>" }`
- Proxy forwards to `https://anilist.co/api/v2/oauth/token` with
  `grant_type=authorization_code`, `client_id`, `client_secret`,
  `redirect_uri=https://anilist.co/api/v2/oauth/pin`, `code`.
- AniList returns `{ token_type, expires_in, access_token, refresh_token }`; the
  proxy normalizes to exactly `{ "access_token": "..." }` (all the client reads).
- On failure upstream status/body is passed through.

---

## Quick verification (after setting env vars)

Missing-secret behavior (before configuring), each returns 501:

```bash
curl -sS -X POST https://<your-deployment>/api/trakt/token \
  -H 'content-type: application/json' -d '{"grant_type":"refresh_token","refresh_token":"x"}'
# -> {"error":"not configured","needs":"TRAKT_CLIENT_ID/TRAKT_CLIENT_SECRET"}
```

Once configured, point the desktop app's proxy base URLs at this deployment and
run each auth flow (Trakt device code, MAL paste-code, AniList paste-code).
