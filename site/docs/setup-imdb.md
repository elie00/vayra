# Setup — IMDb metadata proxy

Serverless replacement for the IMDb proxy previously served by `harbor.site`.

## What this replaces

| harbor.site path            | VAYRA file                | Purpose |
|-----------------------------|---------------------------|---------|
| `/api/imdb/title/{tt}`      | `api/imdb/[...path].js`   | Title aggregate rating. |
| `/api/imdb/episodes/{tt}`   | `api/imdb/[...path].js`   | Per-episode ratings map. |
| `/api/imdb/parental/{tt}`   | `api/imdb/[...path].js`   | Parental-guide category severities. |

App client code matched: `src/lib/providers/harbor-imdb.ts`
(`BASE = "https://harbor.site/api/imdb"`).

## Environment variables

| Env var         | Required | Notes |
|-----------------|----------|-------|
| `IMDB_API_KEY`  | No       | Only needed if you front IMDb through a paid/authenticated gateway. When set, it is forwarded as `Authorization: Bearer <key>` to the GraphQL endpoint. |
| `IMDB_API_BASE` | No       | Override the GraphQL endpoint. Defaults to `https://api.graphql.imdb.com/`. |

**No secret is required by default.** This proxy uses IMDb's own public GraphQL
endpoint (`https://api.graphql.imdb.com/`), which needs no API key, so it is
live immediately after deploy. On upstream error the endpoints degrade to empty
payloads (`{ "rating": null }`, `{ "ratings": {} }`, `{ "categories": [] }`),
matching the app's fault tolerance.

## Where to get a key (only if you choose an authenticated source)

There is no official public IMDb API. Common paid alternatives you could put
behind `IMDB_API_BASE` / `IMDB_API_KEY`:
- IMDb / Amazon "IMDb Pro" data licensing — <https://developer.imdb.com/>
- RapidAPI IMDb providers — <https://rapidapi.com/collection/imdb> (register,
  copy the RapidAPI key). Note: switching provider changes the response shape,
  so the `imdbGraphQL` query mapping in `api/imdb/[...path].js` would need to be
  adapted to that provider — this file targets IMDb's GraphQL schema.

## Request / response contracts matched

### `GET /api/imdb/title/{tt}`
- Response: `{ "rating": number | null }` (app reads `j.rating`; treats
  non-finite / ≤0 as null).

### `GET /api/imdb/episodes/{tt}`
- Response: `{ "ratings": { "<season>:<episode>": number, ... } }`.
  Keys are exactly `` `${season}:${episode}` `` (e.g. `"1:5"`) — the format the
  app looks up via `map.get(\`${season}:${episode}\`)`.

### `GET /api/imdb/parental/{tt}`
- Response: `{ "categories": [ { "category": string, "severity": string }, ... ] }`
  (app reads `j.categories[].category` / `.severity`).

All three set `Cache-Control: public, max-age=21600, s-maxage=86400`.
Invalid IMDb id (not `tt\d+`) returns HTTP `400 { "error": "invalid imdb id" }`.
