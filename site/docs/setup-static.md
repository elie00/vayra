# Static / no-secret endpoints

These four endpoints replace static/read-only paths that the desktop app (Harbor,
white-labelled as VAYRA) fetches from `harbor.site`. They are **live immediately**
on Vercel — no secret, no env var required. Each ships a **minimal valid** response
so the app works unchanged; content can be filled in later without any client change.

The app's base URL is currently hardcoded to `https://harbor.site`. When that base is
later pointed at this deployment, these paths resolve as-is.

---

## 1. Anime hero — `GET /api/hero/anime.json`

- **Replaces:** `https://harbor.site/api/hero/anime.json`
- **Client:** `src/lib/anime-hosted-hero.ts` (`fetchHostedHero`)
- **File served:** `public/api/hero/anime.json`
- **Env vars:** none
- **Method:** GET

### Response contract (what the app parses)
```jsonc
{
  "updated": 0,           // optional number, ignored by client
  "items": [              // optional array; each item mapped by toMeta()
    {
      "id": "string",        // required — item dropped if missing
      "name": "string",      // required — item dropped if missing
      "background": "string",// required — item dropped if missing
      "description": "string?",
      "logo": "string|null?",
      "poster": "string|null?",
      "year": "string|null?",
      "rating": "string|null?",
      "country": "string|null?",
      "format": "MOVIE|... ?",// "MOVIE" => type "movie", else "series"
      "source": "string?"
    }
  ]
}
```

### What we ship
`{ "updated": 0, "items": [] }`

An empty `items` array is a valid, safe response. When zero valid items survive,
`fetchHostedHero()` returns `null` and the app simply does not render a hosted
anime hero (it falls back to its normal hero). To enable the feature later, add
one or more items with at least `id`, `name`, and `background`.

---

## 2. Skip-intro ad segments — `GET /updates/ad-segments.json`

- **Replaces:** `https://harbor.site/updates/ad-segments.json`
- **Client:** `src/lib/skip-intro/adcorpus.ts` (`fetchAdSegments` → `load`)
- **File served:** `public/updates/ad-segments.json`
- **Env vars:** none
- **Method:** GET

### Response contract
```jsonc
{
  "payload": "string?",  // JSON string: CorpusEntry[]
  "sig": "string?"       // base64 Ed25519 signature over payload
}
```
The client verifies `sig` against a **hardcoded** Ed25519 public key baked into the
app (`CORPUS_PUBKEY` in the client). If `payload` or `sig` is missing, **or** the
signature does not verify, the client returns `[]` (no ad segments) — harmless.

### What we ship
`{}`

Empty object → no `payload` → client returns `[]`. This is the correct minimal
response: we do **not** hold the corpus signing **private** key, so we cannot
produce a valid `sig`, and shipping an unsigned/invalid payload would be rejected
by the client anyway. Serving `{}` keeps the app working with zero ad segments.

> To populate this later you would need the Ed25519 **private** key matching the
> public key compiled into the app. Without that key, this endpoint can only ever
> serve an empty corpus. (Out of scope here — no secrets are created.)

---

## 3. Theme catalog — `GET /themes/api/themes?sort=<top|...>&q=<query>`

- **Replaces:** `https://harbor.site/themes/api/themes`
- **Client:** `src/lib/theme-store.ts` (`browseThemes`)
- **File served:** `public/themes/api/themes/index.json`
- **Rewrite:** `vercel.json` maps `/themes/api/themes` → `/themes/api/themes/index.json`
  and sets `Content-Type: application/json`. The `?sort=` / `?q=` query string is
  accepted and ignored (static file).
- **Env vars:** none
- **Method:** GET

### Response contract
```jsonc
{
  "themes": [            // array; client maps each via normalize()
    {
      "id": "string",
      "name": "string",
      "author": "string",
      "blurb": "string",
      "swatch": ["string"],
      "cover": "string|null",       // relative paths get ORIGIN-prefixed by client
      "screenshots": ["string"],
      "layout": "string|null",
      "downloads": 0,
      "ratingAvg": 0,
      "ratingCount": 0,
      "visibility": "public|unlisted",
      "status": "pending|approved|rejected",
      "share": "string",
      "createdAt": "string"
    }
  ]
}
```

### What we ship
`{ "themes": [] }`

Empty catalog → the theme library screen loads and shows no themes. `browseThemes`
resolves cleanly (it only throws on a non-OK HTTP status, which does not happen
here). Add theme objects to `themes[]` to populate the library later.

> **Note — write paths are separate.** `theme-store.ts` also calls dynamic
> endpoints (`POST /themes/api/themes` upload, `.../rate`, `.../visibility`,
> `.../delete`, `GET .../file`). Those require a backend with storage and are
> **not** covered here — they belong to the dynamic-endpoint work, not this
> static set.

---

## 4. Discord Rich Presence images — `GET /discord/*` (static images)

- **Replaces:**
  - `https://harbor.site/discord/harbordiscord.png` (app logo)
  - `https://harbor.site/discord/awards/<file>.png?v=2` (award badges)
- **Clients:**
  - `src/lib/discord/presence.ts` (`HARBOR_LOGO`)
  - `src/lib/discord/use-discord-presence.ts` (`AWARD_IMG` + award maps)
- **Files served:** `public/discord/harbordiscord.png`, `public/discord/awards/*.png`
- **Env vars:** none
- **Method:** GET

These are **not** JSON endpoints — they are plain image URLs. They are only used
inside the desktop (Tauri) build: the URLs are handed to the native Discord Rich
Presence IPC, and **Discord's own servers** fetch them to display next to a user's
"Now playing" status. On web/mobile builds this code path is inert. If an image is
missing, Discord simply shows no icon — harmless.

### What we ship (placeholders)
All paths below exist as **valid 1×1 placeholder PNGs** so the URLs resolve. Replace
them with the real branded artwork when available (same filenames, any dimensions —
Discord recommends square, ≥512×512).

| Path | Used for |
| --- | --- |
| `/discord/harbordiscord.png` | Default large image / fallback logo |
| `/discord/awards/oscar.png` | Oscars |
| `/discord/awards/emmy.png` | Emmys |
| `/discord/awards/golden-globe.png` | Golden Globes |
| `/discord/awards/bafta.png` | BAFTA |
| `/discord/awards/critics-choice.png` | Critics' Choice |
| `/discord/awards/sag.png` | SAG |
| `/discord/awards/cannestrophy.png` | Cannes |
| `/discord/awards/venice.png` | Venice |
| `/discord/awards/berlin.png` | Berlin |
| `/discord/awards/crunchyroll-awards.png` | Crunchyroll Anime Awards |
| `/discord/awards/taaf-icon.png` | TAAF |
| `/discord/awards/jmaf-icon.png` | JMAF |
| `/discord/awards/r-anime-icon.png` | r/anime awards |
| `/discord/awards/animation-kobe.png` | Animation Kobe |

The award URLs are requested with a `?v=2` cache-busting query string by the client;
Vercel serves the same static file regardless of query string.

---

## Deployment note

No env vars are required for any of the above. After `vercel deploy --prod`, verify:

```bash
curl -s https://<deployment>/api/hero/anime.json
curl -s https://<deployment>/updates/ad-segments.json
curl -s "https://<deployment>/themes/api/themes?sort=top"
curl -sI https://<deployment>/discord/harbordiscord.png | grep -i content-type
```
