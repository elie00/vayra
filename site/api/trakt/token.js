// POST /api/trakt/token
// Replaces https://harbor.site/api/trakt/token (TRAKT_TOKEN_PROXY)
//
// Harbor client: src/lib/trakt/client.ts -> refreshAccessToken()
//   POST JSON body: { refresh_token: string, grant_type: "refresh_token" }
//   On success expects HTTP 200 JSON:
//     { access_token, refresh_token, created_at, expires_in }
//   On failure the client just treats !res.ok as "clear session".
//
// This proxy injects the client secret (kept off the desktop app) and forwards
// the refresh to Trakt's real /oauth/token endpoint.
//
// Trakt /oauth/token (grant_type=refresh_token) expects:
//   { refresh_token, client_id, client_secret, redirect_uri, grant_type }
// and returns exactly { access_token, refresh_token, created_at, expires_in, ... }
// so we can pass the upstream JSON straight through.
//
// Docs: https://trakt.docs.apiary.io/#reference/authentication-oauth/get-token/exchange-refresh_token-for-access_token

const TRAKT_TOKEN_URL = "https://api.trakt.tv/oauth/token";
// Trakt requires a redirect_uri even for refresh; the OOB value is what device
// / PIN based apps use and matches how these tokens were originally minted.
const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export default async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res
      .status(501)
      .json({ error: "not configured", needs: "TRAKT_CLIENT_ID/TRAKT_CLIENT_SECRET" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!refreshToken) {
    return res.status(400).json({ error: "missing refresh_token" });
  }

  try {
    const upstream = await fetch(TRAKT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: OOB_REDIRECT_URI,
        grant_type: "refresh_token",
      }),
    });

    const text = await upstream.text();
    // Mirror Trakt's status so the client's !res.ok handling stays correct.
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    return res
      .status(502)
      .json({ error: "upstream error", detail: String(e && e.message ? e.message : e) });
  }
};
