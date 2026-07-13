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

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const code = typeof body.code === "string" ? body.code : "";
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
    });

    const text = await upstream.text();
    // Pass the status through UNCHANGED: the client's poll loop depends on the
    // exact 200/400/429/410/418 codes from Trakt.
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    return res
      .status(502)
      .json({ error: "upstream error", detail: String(e && e.message ? e.message : e) });
  }
};
