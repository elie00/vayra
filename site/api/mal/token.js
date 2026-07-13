// POST /api/mal/token
// Replaces https://harbor.site/api/mal/token (MAL_TOKEN_PROXY)
//
// Harbor client: src/lib/mal/auth.ts
//   exchangeCode():  POST JSON { grant_type: "authorization_code", code, code_verifier }
//   refreshAccessToken(): POST JSON { grant_type: "refresh_token", refresh_token }
//   Both expect HTTP 2xx JSON: { access_token, refresh_token, expires_in }
//   On !res.ok the client reads res.text() for an error message.
//
// MAL uses PKCE with code_challenge_method=plain (see buildAuthorizeUrl), so the
// original code_verifier equals the code_challenge. The redirect_uri must match
// MAL_REDIRECT_URI configured in the client (https://harbor.site/mal/ today; set
// this proxy's MAL_REDIRECT_URI env to whatever the app is built with).
//
// This proxy injects client_id + client_secret (kept off the desktop app) and
// converts the client's JSON body into the x-www-form-urlencoded form MAL's
// /v1/oauth2/token endpoint requires.
//
// Docs: https://myanimelist.net/apiconfig/references/authorization#step-5-exchange-authorization-code-for-refresh-and-access-tokens

const MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";

export default async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const clientId = process.env.MAL_CLIENT_ID;
  const clientSecret = process.env.MAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res
      .status(501)
      .json({ error: "not configured", needs: "MAL_CLIENT_ID/MAL_CLIENT_SECRET" });
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

  const grantType = typeof body.grant_type === "string" ? body.grant_type : "";

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);

  if (grantType === "authorization_code") {
    const code = typeof body.code === "string" ? body.code : "";
    const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
    if (!code || !codeVerifier) {
      return res.status(400).json({ error: "missing code or code_verifier" });
    }
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("code_verifier", codeVerifier);
    // redirect_uri must match the one used to obtain the authorization code.
    const redirectUri = process.env.MAL_REDIRECT_URI;
    if (redirectUri) form.set("redirect_uri", redirectUri);
  } else if (grantType === "refresh_token") {
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    if (!refreshToken) {
      return res.status(400).json({ error: "missing refresh_token" });
    }
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refreshToken);
  } else {
    return res.status(400).json({ error: "unsupported grant_type" });
  }

  try {
    const upstream = await fetch(MAL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const text = await upstream.text();
    // Pass MAL's status + JSON body straight through; the client reads
    // { access_token, refresh_token, expires_in } on success and .text() on error.
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    return res
      .status(502)
      .json({ error: "upstream error", detail: String(e && e.message ? e.message : e) });
  }
};
