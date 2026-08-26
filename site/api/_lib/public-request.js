const RATE_LIMIT_STORE = Symbol.for("vayra.publicRequestRateLimits");
const MAX_RATE_LIMIT_KEYS = 5_000;

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

function pruneExpired(store, now) {
  for (const [key, value] of store) {
    if (value.resetAt <= now) store.delete(key);
  }
  if (store.size >= MAX_RATE_LIMIT_KEYS) store.clear();
}

export function consumeRateLimit(req, { scope, limit, windowMs, now = Date.now() }) {
  const store = rateLimitStore();
  if (store.size >= MAX_RATE_LIMIT_KEYS) pruneExpired(store, now);

  const key = `${scope}:${clientAddress(req)}`;
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function readJsonBody(req, maxBytes = 8_192) {
  let body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBytes) return { error: "payload too large", status: 413 };
    try {
      body = JSON.parse(body);
    } catch {
      return { error: "invalid json", status: 400 };
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid json body", status: 400 };
  }
  try {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > maxBytes) {
      return { error: "payload too large", status: 413 };
    }
  } catch {
    return { error: "invalid json body", status: 400 };
  }
  return { body };
}

export function cleanLine(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

export function enforceRateLimit(req, res, options) {
  const result = consumeRateLimit(req, options);
  if (result.allowed) return true;
  res.setHeader("Retry-After", String(result.retryAfter));
  res.status(429).json({ error: "too many requests" });
  return false;
}

