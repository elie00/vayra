import { afterEach, describe, expect, it, vi } from "vitest";
import anilistTokenHandler from "./anilist/token.js";
import malTokenHandler from "./mal/token.js";
import traktDeviceTokenHandler from "./trakt/device-token.js";
import traktTokenHandler from "./trakt/token.js";

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

function post(body) {
  const octet = Math.floor(Math.random() * 200) + 1;
  return { method: "POST", body, headers: { "x-forwarded-for": `198.51.100.${octet}` } };
}

function configure(prefix) {
  vi.stubEnv(`${prefix}_CLIENT_ID`, "client-id");
  vi.stubEnv(`${prefix}_CLIENT_SECRET`, "client-secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OAuth proxy handlers", () => {
  it("rejects malformed JSON before calling Trakt", async () => {
    configure("TRAKT");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await traktTokenHandler(post("{"), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid json" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("preserves Trakt device-flow statuses and applies a timeout", async () => {
    configure("TRAKT");
    const upstream = vi.fn().mockResolvedValue({ status: 418, text: async () => '{"error":"denied"}' });
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await traktDeviceTokenHandler(post({ code: "device-code" }), res);

    expect(res.statusCode).toBe(418);
    expect(res.body).toBe('{"error":"denied"}');
    const request = upstream.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({ code: "device-code", client_secret: "client-secret" });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("normalizes a successful AniList response", async () => {
    configure("ANILIST");
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"access_token":"access","refresh_token":"not-exposed"}',
    });
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await anilistTokenHandler(post({ code: "authorization-code" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ access_token: "access" });
  });

  it("bounds MAL requests before constructing the upstream form", async () => {
    configure("MAL");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await malTokenHandler(
      post({ grant_type: "refresh_token", refresh_token: "x".repeat(5_000) }),
      res,
    );

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "payload too large" });
    expect(upstream).not.toHaveBeenCalled();
  });
});
