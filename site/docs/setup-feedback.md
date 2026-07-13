# Setup: Feedback / Ad-report intake

Self-hosted replacement for the Harbor "bugs" backend feedback + ad-report endpoints,
deployed as Vercel serverless functions in this project.

## What this replaces

| Harbor client call | Old harbor.site URL | New endpoint (this project) |
| --- | --- | --- |
| `submitBuildFeedback()` in `src/lib/build-feedback-submit.ts` | `https://bugs.harbor.site/v1/feedback` | `POST /v1/feedback` → `api/v1/feedback.js` |
| `submitAdReport()` in `src/lib/ad-report/submit.ts` | `https://bugs.harbor.site/v1/adreport` | `POST /v1/adreport` → `api/v1/adreport.js` |

> Note: the bug-report flow (`src/lib/bug-report.ts`, `POST /v1/reports` with `multipart/form-data`
> and file uploads) is NOT implemented here — this service only covers the two JSON endpoints
> above (feedback + ad-report). Both were requested because they share the same webhook sink.

Since there is no database, each submission is forwarded to a webhook you control
(Discord or Slack). If the webhook env var is not set, the endpoints return HTTP 501
`{ "error": "not configured", "needs": "FEEDBACK_WEBHOOK_URL" }` so the site still deploys
but the endpoints are clearly inert until configured.

## Env vars needed

| Env var | Required | Purpose |
| --- | --- | --- |
| `FEEDBACK_WEBHOOK_URL` | yes | Webhook URL that receives every feedback + ad-report submission. Used by BOTH endpoints. |

Set it in **Vercel → Project → Settings → Environment Variables**, then redeploy.

## Where to get the secret

Create a **Discord webhook** (easiest, no account cost):

1. In Discord, open the target **Server** → a text **Channel**.
2. Channel settings (gear icon) → **Integrations** → **Webhooks** → **New Webhook**.
3. Name it (e.g. "VAYRA feedback"), pick the channel, click **Copy Webhook URL**.
4. Paste that URL as `FEEDBACK_WEBHOOK_URL` in Vercel.
   Docs: https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks

Alternatively a **Slack Incoming Webhook** works too (the functions send both a
`content` key for Discord and a `text` key for Slack, so either type accepts the payload):
https://api.slack.com/messaging/webhooks

## Request / response contracts (matched from Harbor client code)

The Harbor client only checks `res.ok` on both calls, so any 2xx JSON response is treated
as success. These functions return `200 { "ok": true }`.

### POST /v1/feedback
Request body (JSON), from `submitBuildFeedback()`:
```json
{ "version": "1.2.3", "rating": 5, "beta": false }
```
- `version` — app version string (`APP_VERSION`)
- `rating` — number
- `beta` — boolean (`IS_BETA_BUILD`)

Response: `200 { "ok": true }` on success · `501` if unconfigured · `502` if webhook rejects.

### POST /v1/adreport
Request body (JSON), from `submitAdReport()`:
```json
{
  "content": "<opaque-fingerprint-hash>",
  "source": "ih_... | rg_...",
  "ranges": [ { "start": 12, "end": 34 } ]
}
```
- `content` — opaque fingerprint hash of the stream
- `source` — fingerprint source id (client only sends when it starts with `ih_` or `rg_`)
- `ranges` — array of `{ start, end }` integer-second ad intervals (`end > start`)

Response: `200 { "ok": true }` on success · `501` if unconfigured · `502` if webhook rejects.

## Notes

- Node runtime, built-in global `fetch`, no npm dependencies.
- Secrets are read from `process.env` only; nothing is hardcoded.
- No data is persisted here; the webhook (Discord/Slack) is the record of submissions.
