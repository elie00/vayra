# Watch-party relay — setup (documentation only, no backend needed)

This service is **documentation only**. There is **no** file under `api/` for the
watch-party relay, and VAYRA does **not** need to host anything for it to work.

## TL;DR

- The desktop app **already** lets each user deploy **their own** relay to **their
  own** Cloudflare account, for free, from inside the app ("Deploy a relay" flow).
  This is a client-side Tauri command (`cf_deploy_relay`) that talks directly to
  Cloudflare — VAYRA's servers are never in the loop.
- `wss://pub.harbor.site` is only the **default fallback** relay. Nothing in this
  static-site project is required to keep watch-party working: users who deploy
  their own relay never touch it.
- Changing the default fallback away from `pub.harbor.site` would require (1)
  hosting a default VAYRA relay somewhere and (2) a one-line change in the app.
  Both are **out of scope** for this project (see below).
- The new **VARA/VEYA local sync** prototype does **not** use this relay at all —
  it runs over a local Unix-socket broker on the same machine.

---

## (a) Users can self-host their own relay from inside the app (free)

The client already ships a complete "bring your own Cloudflare account" flow. It is
native-only (desktop app), guarded by `ensureNative()`, and never routes through any
VAYRA server.

Client code (in the harbor repo, read-only reference):
`src/lib/together/cf-deploy.ts`

```ts
export function listAccounts(apiToken: string): Promise<CfAccount[]>      // cf_list_accounts
export function deployRelay(apiToken, accountId): Promise<DeployResult>   // cf_deploy_relay
export function deleteRelay(apiToken, accountId): Promise<void>           // cf_delete_relay
export function relayStatus(apiToken, accountId): Promise<boolean>        // cf_relay_status
```

`DeployResult` shape returned to the app:

```ts
type DeployResult = {
  url: string;          // e.g. wss://<script>.<subdomain>.workers.dev — becomes settings.togetherRelayUrl
  account_id: string;
  script_name: string;
  subdomain: string;
};
```

UI entry point (harbor repo): `src/views/settings/relay-panel.tsx` — Settings ->
VAYRA Relay -> **"Deploy a relay"** (desktop only). The flow:

1. User creates a **Cloudflare API token** and pastes it into the app.
2. App calls `cf_list_accounts` to list the user's Cloudflare accounts.
3. User picks an account; app calls `cf_deploy_relay`, which deploys a Cloudflare
   Worker to **that user's** account and returns the `wss://…workers.dev` URL.
4. App stores that URL as `settings.togetherRelayUrl` and uses it for watch-party.
5. User can later `cf_relay_status` / `cf_delete_relay` from the same panel
   (as long as they kept the API token — Cloudflare shows tokens only once).

### What the user needs

| Item | Where to get it |
| --- | --- |
| Cloudflare account (free tier is enough) | https://dash.cloudflare.com/sign-up |
| Cloudflare API token | https://dash.cloudflare.com/profile/api-tokens -> **Create Token**. Needs Workers Scripts **Edit** permission (Workers deploy). Cloudflare displays the token **once** — save it offline; without it the app cannot stop/redeploy/update the relay. You can still delete the Worker manually at dash.cloudflare.com -> Workers & Pages. |

There are **no VAYRA env vars** for this. The token stays on the user's machine
(`settings.togetherCfToken`) and is sent only to Cloudflare's API by the Rust side
of the desktop app.

---

## (b) Changing the DEFAULT fallback away from pub.harbor.site — out of scope

The default fallback is a hardcoded client constant, not a server endpoint:

`src/lib/together/relay-version.ts`

```ts
export const REQUIRED_RELAY_VERSION = 10;
export const HARBOR_PUBLIC_RELAY = "wss://pub.harbor.site";

export function isPublicRelay(url: string): boolean {
  // true only when host === "pub.harbor.site"
}
```

`HARBOR_PUBLIC_RELAY` is used in exactly one place as a "reset to default" button
target (`relay-panel.tsx:350`, `update({ togetherRelayUrl: HARBOR_PUBLIC_RELAY })`).

To make VAYRA's own relay the default instead of `pub.harbor.site`, you would need
BOTH of the following — **neither is done in this project**:

1. **Host a default VAYRA relay.** Deploy the same relay Worker under a stable
   hostname you control (e.g. `wss://pub.vayra.<domain>`). A Cloudflare Worker
   `workers.dev` URL is **not** a Vercel serverless function — Vercel functions are
   request/response (Node), not persistent WebSocket relays — so this cannot be an
   `api/*.js` file here. It must live on Cloudflare (or another WebSocket-capable
   host).
2. **One-line app change** in the harbor repo:
   `HARBOR_PUBLIC_RELAY = "wss://pub.harbor.site"` -> your new hostname (and update
   the `isPublicRelay` host check to match). This is an edit to the desktop app,
   which we are explicitly **not** modifying.

Because (1) needs a live WebSocket host (not a Vercel function) and (2) needs an app
edit, changing the default is intentionally left out of this backend project. Until
then, users who want to avoid `pub.harbor.site` simply use the in-app
**"Deploy mine instead"** flow from (a).

---

## (c) VARA/VEYA local sync does NOT use this relay

The new prototype (`src/lib/together/sync/`) is a **local** transport, not a network
relay. Per its own source header (`src/lib/together/sync/local-transport.ts`), the
`SyncTransport` is backed by a **local Unix-socket broker** via the Rust sync-client:

- client -> broker: Tauri commands `vayra_sync_join` / `leave` / `send` / `publish`
- broker -> client: Tauri events `vayra://sync-*`

It never opens a `wss://` connection, never reads `HARBOR_PUBLIC_RELAY`, and never
calls `cf_deploy_relay`. Solo playback invokes nothing until `join()` is called.
So the watch-party relay described above is unrelated to VARA/VEYA local sync — no
relay (default or self-hosted) is involved in that path.

---

## Summary

| Concern | Status |
| --- | --- |
| Self-host relay (per user, Cloudflare, free) | Already shipped in the desktop app (`cf_deploy_relay`) — nothing to build here |
| `wss://pub.harbor.site` | Default fallback only; not required by anything in this repo |
| Replace the default fallback with a VAYRA relay | Out of scope: needs a hosted WebSocket relay + a one-line app change |
| VARA/VEYA local sync | Local Unix-socket broker; does not use this relay at all |
| Files under `api/` | None for this service |
| VAYRA env vars | None |
