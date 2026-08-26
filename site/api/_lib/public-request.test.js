import { describe, expect, it } from "vitest";
import { cleanLine, consumeRateLimit, readJsonBody } from "./public-request.js";

describe("public request guards", () => {
  it("limits each scope and client independently", () => {
    const a = { headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" } };
    const b = { headers: { "x-forwarded-for": "203.0.113.2" } };
    const options = { scope: `test-${Math.random()}`, limit: 2, windowMs: 1_000, now: 100 };

    expect(consumeRateLimit(a, options).allowed).toBe(true);
    expect(consumeRateLimit(a, options).allowed).toBe(true);
    expect(consumeRateLimit(a, options)).toEqual({ allowed: false, retryAfter: 1 });
    expect(consumeRateLimit(b, options).allowed).toBe(true);
    expect(consumeRateLimit(a, { ...options, now: 1_101 }).allowed).toBe(true);
  });

  it("rejects invalid and oversized JSON", () => {
    expect(readJsonBody({ body: "{" })).toEqual({ error: "invalid json", status: 400 });
    expect(readJsonBody({ body: `{"value":"${"x".repeat(30)}"}` }, 20)).toEqual({
      error: "payload too large",
      status: 413,
    });
    expect(readJsonBody({ body: { value: 1 } })).toEqual({ body: { value: 1 } });
  });

  it("turns webhook-controlled fields into bounded single lines", () => {
    expect(cleanLine("  hello\n@everyone\u0000world  ", 15)).toBe("hello @everyone");
  });
});
