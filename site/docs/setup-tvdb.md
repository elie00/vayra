# Setup — TVDB media metadata proxy

Serverless replacement for the TVDB proxy endpoints previously served by
`harbor.site`. The desktop app (harbor) points its base URL here and works
unchanged.

## What this replaces

| harbor.site path         | VAYRA file                       | Purpose |
|--------------------------|----------------------------------|---------|
| `/api/tvdb/v4/*`         | `api/tvdb/v4/[...path].js`        | Pass-through proxy to the TVDB v4 API; attaches server-side bearer token. |
| `/api/tvdb/images`       | `api/tvdb/images.js`             | Episode-still image map keyed by absolute / season+episode. |
| `/api/tvdb/artwork`      | `api/tvdb/artwork.js`           | Series artwork: `backgrounds`, `clearLogos`, `posters`. |

App client code matched: `src/lib/providers/tvdb.ts` (`PROXY_V4`) and
`src/lib/providers/tvdb-proxy.ts` (`PROXY`, `ART_PROXY`).

## Environment variables

| Env var        | Required | Notes |
|----------------|----------|-------|
| `TVDB_API_KEY` | Yes      | TVDB v4 API key. Used server-side to log in (`POST https://api4.thetvdb.com/v4/login` with `{ "apikey": ... }`) and obtain a bearer token, which is cached in-memory (~23 h) and attached to every upstream request. |

If `TVDB_API_KEY` is missing, every endpoint returns HTTP `501`
`{ "error": "not configured", "needs": "TVDB_API_KEY" }` so the deployment is
live but clearly inert until configured.

Set it on Vercel: Project → Settings → Environment Variables → add
`TVDB_API_KEY`, then redeploy.

## Where to get a TVDB key

1. Create a free account at <https://thetvdb.com/>.
2. Go to <https://thetvdb.com/dashboard/account/apikey> (Dashboard → your
   account → **API Key**) and register a **v4** project key.
   - The v4 "negotiated" / project API keys can be used directly with the
     `/login` endpoint used here (the app supplies only `{ apikey }`).
3. Copy the key into `TVDB_API_KEY`.

TVDB API docs: <https://thetvdb.github.io/v4-api/>

## Request / response contracts matched

### `GET /api/tvdb/v4/{...path}`
- The app calls `${PROXY_V4}${path}`, e.g.
  `/api/tvdb/v4/search/remoteid/tt1234567`,
  `/api/tvdb/v4/series/123/extended?meta=translations&short=false`,
  `/api/tvdb/v4/series/123/episodes/default?season=2`.
- Response: the TVDB v4 body forwarded **verbatim** (status + JSON). The app
  reads the `data` field of that body.
- Caching: `Cache-Control: public, max-age=3600, s-maxage=86400`.

### `GET /api/tvdb/images?series=<id>|imdb=tt...&type=<order>`
- `series` (TVDB series id) preferred; else `imdb` (resolved via
  `/search/remoteid`). `type` is `default|dvd|absolute|...` (the app sends
  `default` when its order is "aired").
- Response: `{ "images": { "abs<N>": "<url>", "s<season>e<ep>": "<url>", ... } }`.
  Keys match `pickTvdbImage`: `abs${absoluteNumber}` and `s${season}e${number}`.
  Missing/unknown series returns `{ "images": {} }` (HTTP 200), matching the
  app's tolerance for empty results.
- Caching: `Cache-Control: public, max-age=3600, s-maxage=86400`.

### `GET /api/tvdb/artwork?series=<id>|imdb=tt...`
- Response: `{ "backgrounds": [url...], "clearLogos": [url...], "posters": [url...] }`,
  each sorted by TVDB `score` (best first) so the app's `[0]` picks the top
  artwork. Built from `/series/{id}/artworks` bucketed by TVDB type id
  (2 = poster, 3 = background, 23 = clearlogo). Empty arrays on miss (HTTP 200).
- Caching: `Cache-Control: public, max-age=3600, s-maxage=86400`.

## Notes
- Image URLs are normalised to absolute `https://artworks.thetvdb.com/...` when
  TVDB returns a relative path (same rule as the app's `tvdbImg`).
- `api/_lib/tvdb.js` is a shared helper (login/token/URL), not a route — the
  leading `_` keeps Vercel from exposing it.
