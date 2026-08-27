import {
  WEB_PROXY_METHODS,
  webProxyTarget,
} from "./_lib/web-proxy-policy.js";

const RATE_LIMIT_STORE = Symbol.for("vayra.webProxyRateLimits");
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;

function rateLimitStore() {
  if (!globalThis[RATE_LIMIT_STORE]) globalThis[RATE_LIMIT_STORE] = new Map();
  return globalThis[RATE_LIMIT_STORE];
}

function clientAddress(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (Array.isArray(forwarded)) return forwarded[0] || "unknown";
  if (typeof forwarded === "string") return forwarded.split(",", 1)[0].trim() || "unknown";
  return req.socket?.remoteAddress || "unknown";
}

function consumeRateLimit(req) {
  const now = Date.now();
  const store = rateLimitStore();
  for (const [key, value] of store) {
    if (value.resetAt <= now) store.delete(key);
  }
  if (store.size > 5_000) store.clear();

  const key = clientAddress(req);
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function requestBody(req) {
  if (req.body == null) return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
}

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    return res.status(204).send("");
  }
  if (!WEB_PROXY_METHODS.has(req.method)) {
    res.setHeader("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "method not allowed" });
  }

  const rate = consumeRateLimit(req);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    return res.status(429).json({ error: "too many requests" });
  }

  const rawTarget = Array.isArray(req.query?.u) ? null : req.query?.u;
  const target = webProxyTarget(rawTarget);
  if (!target) return res.status(403).json({ error: "proxy target not allowed" });

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : requestBody(req);
  if (body != null && Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
    return res.status(413).json({ error: "request too large" });
  }

  const headers = {
    accept: req.headers?.accept || "application/json, text/plain, */*",
    "user-agent": "VAYRA-Lite/1.0",
  };
  const contentType = req.headers?.["content-type"];
  if (contentType) headers["content-type"] = contentType;
  const range = req.headers?.range;
  if (range) headers.range = range;
  const authorization = req.headers?.["x-harbor-auth"];
  if (authorization) headers.authorization = authorization;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "upstream timeout" : "upstream failed",
    });
  } finally {
    clearTimeout(timer);
  }

  const declaredLength = Number(upstream.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return res.status(502).json({ error: "upstream response too large" });
  }
  const payload = Buffer.from(await upstream.arrayBuffer());
  if (payload.byteLength > MAX_RESPONSE_BYTES) {
    return res.status(502).json({ error: "upstream response too large" });
  }

  const responseType = upstream.headers.get("content-type");
  if (responseType) res.setHeader("Content-Type", responseType);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
  return res.status(upstream.status).send(req.method === "HEAD" ? "" : payload);
}
