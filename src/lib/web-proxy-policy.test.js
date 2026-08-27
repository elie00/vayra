import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/web-proxy.js";
import { isAllowedWebProxyHost, webProxyTarget } from "../../api/_lib/web-proxy-policy.js";

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

function request(target, overrides = {}) {
  return {
    method: "GET",
    headers: { "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
    query: { u: target },
    url: "/api/web-proxy",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VAYRA Lite web proxy", () => {
  it("accepts only the explicit provider policy", () => {
    expect(isAllowedWebProxyHost("api.real-debrid.com")).toBe(true);
    expect(isAllowedWebProxyHost("addon.elfhosted.com")).toBe(true);
    expect(isAllowedWebProxyHost("elfhosted.com")).toBe(false);
    expect(isAllowedWebProxyHost("api.real-debrid.com.attacker.test")).toBe(false);
    expect(isAllowedWebProxyHost("127.0.0.1")).toBe(false);
  });

  it("preserves the provider path and query and requires HTTPS", () => {
    expect(webProxyTarget("https://v3-cinemeta.strem.io/meta/movie/tt123.json?x=1")?.href)
      .toBe("https://v3-cinemeta.strem.io/meta/movie/tt123.json?x=1");
    expect(webProxyTarget("http://v3-cinemeta.strem.io/meta/movie/tt123.json")).toBeNull();
    expect(webProxyTarget("https://localhost/admin")).toBeNull();
  });

  it("forwards the private authorization header without exposing upstream cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "secret=1" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(
      request("https://api.real-debrid.com/rest/1.0/user", {
        headers: {
          "x-forwarded-for": "192.0.2.201",
          "x-harbor-auth": "Bearer private-token",
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(upstream.mock.calls[0][1].headers.authorization).toBe("Bearer private-token");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["Cache-Control"]).toContain("no-store");
  });

  it("rejects disallowed targets before fetching", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(request("https://169.254.169.254/latest/meta-data"), res);

    expect(res.statusCode).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});
