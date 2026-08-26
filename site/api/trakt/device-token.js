// POST /api/trakt/device-token
// Replaces https://harbor.site/api/trakt/device-token (TRAKT_DEVICE_TOKEN_PROXY)
//
// Harbor client: src/lib/trakt/device-auth.ts -> pollOnce()
//   POST JSON body: { code: string }   // the device_code from /oauth/device/code
//   The client branches on HTTP STATUS, not body:
//     200 -> authorized; body JSON { access_token, refresh_token, created_at, expires_in }
//     400 -> pending (user hasn't entered the code yet)
//     429 -> slow_down
//     410 -> expired
//     418 -> denied
//     else -> error
//
// This proxy injects the client secret and forwards to Trakt's real
// /oauth/device/token endpoint, passing the upstream status + body through
// verbatim so the client's status-based state machine works unchanged.
//
// Trakt /oauth/device/token expects: { code, client_id, client_secret }
// and returns those exact status codes.
//
// Docs: https://trakt.docs.apiary.io/#reference/authentication-devices/get-token/poll-for-the-access_token

import { cleanLine, enforceRateLimit, readJsonBody } from "../_lib/public-request.js";

const TRAKT_DEVICE_TOKEN_URL = "https://api.trakt.tv/oauth/device/token";

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

  // Device auth legitimately polls every few seconds, so keep this ceiling
  // above the normal flow while still bounding abusive traffic.
  if (!enforceRateLimit(req, res, { scope: "trakt-device-token", limit: 150, windowMs: 10 * 60_000 })) {
    return;
  }

  const parsed = readJsonBody(req, 4_096);
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });

  const code = cleanLine(parsed.body.code, 512);
  if (!code) {
    return res.status(400).json({ error: "missing code" });
  }

  try {
    const upstream = await fetch(TRAKT_DEVICE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    const text = await upstream.text();
    // Pass the status through UNCHANGED: the client's poll loop depends on the
    // exact 200/400/429/410/418 codes from Trakt.
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch {
    return res.status(502).json({ error: "upstream error" });
  }
};
