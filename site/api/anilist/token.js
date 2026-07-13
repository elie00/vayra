// POST /api/anilist/token
// Replaces https://bugs.harbor.site/v1/anilist/token (ANILIST_TOKEN_EXCHANGE_URL)
//
// Harbor client: src/lib/anilist/auth.ts -> exchangeCode()
//   POST JSON body: { code: string }
//   On success expects HTTP 2xx JSON: { access_token: string }
//   (the client only reads json.access_token; other fields are ignored)
//   On !res.ok it shows "AniList rejected that code" and re-prompts.
//
// The client authorizes with response_type=code and redirect_uri =
// https://anilist.co/api/v2/oauth/pin (ANILIST_PIN_REDIRECT_URI), so the token
// exchange must use that same redirect_uri.
//
// This proxy injects client_id + client_secret (kept off the desktop app) and
// forwards to AniList's real token endpoint, then returns { access_token }.
//
// Docs: https://docs.anilist.co/guide/auth/#making-the-authorization-code-grant

const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
// Must match ANILIST_PIN_REDIRECT_URI in the client's config.ts.
const ANILIST_PIN_REDIRECT_URI = "https://anilist.co/api/v2/oauth/pin";

export default async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const clientId = process.env.ANILIST_CLIENT_ID;
  const clientSecret = process.env.ANILIST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res
      .status(501)
      .json({ error: "not configured", needs: "ANILIST_CLIENT_ID/ANILIST_CLIENT_SECRET" });
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
    const upstream = await fetch(ANILIST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: ANILIST_PIN_REDIRECT_URI,
        code,
      }),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      // Mirror the failure so the client re-prompts; keep the upstream status.
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json");
      return res.send(text);
    }

    // AniList returns { token_type, expires_in, access_token, refresh_token }.
    // The client only needs access_token, so normalize to exactly that shape.
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "invalid upstream response" });
    }
    if (!json || typeof json.access_token !== "string") {
      return res.status(502).json({ error: "no access_token from AniList" });
    }
    return res.status(200).json({ access_token: json.access_token });
  } catch (e) {
    return res
      .status(502)
      .json({ error: "upstream error", detail: String(e && e.message ? e.message : e) });
  }
};
