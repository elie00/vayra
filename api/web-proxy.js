import {
  WEB_PROXY_METHODS,
  webProxyTarget,
} from "./_lib/web-proxy-policy.js";

const RATE_LIMIT_STORE = Symbol.for("vayra.webProxyRateLimits");
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;
const UPSTREAM_DEADLINE_MS = 25_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TIMED_OUT = Symbol("timed out");

class UpstreamRefused extends Error {}

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

function redirectTarget(location, from) {
  try {
    return webProxyTarget(new URL(location, from).href);
  } catch {
    return null;
  }
}

/** Follows redirects by hand: each hop passes the same policy as the first
 * address, and the credentials never leave the host they were meant for. */
async function fetchWithinPolicy(target, { method, headers, body }, signal) {
  let url = target;
  let request = { method, headers: { ...headers }, body };
  for (let hop = 0; ; hop += 1) {
    const upstream = await fetch(url, { ...request, redirect: "manual", signal });
    const location = REDIRECT_STATUSES.has(upstream.status) ? upstream.headers.get("location") : null;
    if (!location) return upstream;
    if (hop >= MAX_REDIRECTS) throw new UpstreamRefused("too many upstream redirects");
    const next = redirectTarget(location, url);
    if (!next) throw new UpstreamRefused("upstream redirect not allowed");
    await upstream.body?.cancel();

    const nextHeaders = { ...request.headers };
    if (next.origin !== url.origin) delete nextHeaders.authorization;
    const becomesGet = upstream.status === 303
      ? request.method !== "HEAD"
      : upstream.status !== 307 && upstream.status !== 308 && request.method === "POST";
    if (becomesGet) {
      delete nextHeaders["content-type"];
      request = { method: "GET", headers: nextHeaders, body: undefined };
    } else {
      request = { ...request, headers: nextHeaders };
    }
    url = next;
  }
}

/** Reads the body chunk by chunk so an upstream that hides its length, or
 * stalls halfway, is cut off at the limit or at the deadline. */
async function readWithinLimit(upstream, signal) {
  if (!upstream.body) return Buffer.alloc(0);
  const timedOut = new Promise((resolve) => {
    if (signal.aborted) resolve(TIMED_OUT);
    else signal.addEventListener("abort", () => resolve(TIMED_OUT), { once: true });
  });
  const reader = upstream.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const step = await Promise.race([reader.read(), timedOut]);
    if (step === TIMED_OUT) throw Object.assign(new Error("upstream timeout"), { name: "AbortError" });
    if (step.done) return Buffer.concat(chunks, size);
    size += step.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) throw new UpstreamRefused("upstream response too large");
    chunks.push(step.value);
  }
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
  const timer = setTimeout(() => controller.abort(), UPSTREAM_DEADLINE_MS);
  let upstream;
  let payload;
  try {
    upstream = await fetchWithinPolicy(target, { method: req.method, headers, body }, controller.signal);
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new UpstreamRefused("upstream response too large");
    payload = await readWithinLimit(upstream, controller.signal);
  } catch (error) {
    if (error instanceof UpstreamRefused) {
      controller.abort();
      return res.status(502).json({ error: error.message });
    }
    const timedOut = error?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "upstream timeout" : "upstream failed",
    });
  } finally {
    clearTimeout(timer);
  }

  const responseType = upstream.headers.get("content-type");
  if (responseType) res.setHeader("Content-Type", responseType);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
  return res.status(upstream.status).send(req.method === "HEAD" ? "" : payload);
}
