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

import { cleanLine, enforceRateLimit, readJsonBody } from "../_lib/public-request.js";

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

  if (!enforceRateLimit(req, res, { scope: "mal-token", limit: 30, windowMs: 10 * 60_000 })) {
    return;
  }

  const parsed = readJsonBody(req, 4_096);
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });
  const body = parsed.body;

  const grantType = cleanLine(body.grant_type, 64);

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);

  if (grantType === "authorization_code") {
    const code = cleanLine(body.code, 1_024);
    const codeVerifier = cleanLine(body.code_verifier, 1_024);
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
    const refreshToken = cleanLine(body.refresh_token, 2_048);
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
      signal: AbortSignal.timeout(8_000),
    });

    const text = await upstream.text();
    // Pass MAL's status + JSON body straight through; the client reads
    // { access_token, refresh_token, expires_in } on success and .text() on error.
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch {
    return res.status(502).json({ error: "upstream error" });
  }
};
