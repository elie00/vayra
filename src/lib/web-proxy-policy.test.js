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

function redirect(location, status = 302) {
  return new Response(null, { status, headers: { location } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it("checks a redirect against the policy before following it", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(redirect("https://169.254.169.254/latest/meta-data"));
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(request("https://addon.workers.dev/manifest.json"), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "upstream redirect not allowed" });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][1].redirect).toBe("manual");
  });

  it("follows a redirect that stays inside the policy", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(redirect("/meta/movie/tt123.json"))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(request("https://v3-cinemeta.strem.io/old.json"), res);

    expect(res.statusCode).toBe(200);
    expect(String(upstream.mock.calls[1][0])).toBe("https://v3-cinemeta.strem.io/meta/movie/tt123.json");
    expect(res.body.toString()).toBe('{"ok":true}');
  });

  it("keeps the authorization header away from another host", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(redirect("https://files.workers.dev/download"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(
      request("https://api.real-debrid.com/rest/1.0/unrestrict", {
        headers: { "x-forwarded-for": "192.0.2.202", "x-harbor-auth": "Bearer private-token" },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(upstream.mock.calls[0][1].headers.authorization).toBe("Bearer private-token");
    expect(upstream.mock.calls[1][1].headers.authorization).toBeUndefined();
  });

  it("turns a POST into a GET without its body after a 303", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(redirect("https://api.torbox.app/v1/result", 303))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(
      request("https://api.torbox.app/v1/create", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.203", "content-type": "application/json" },
        body: { magnet: "x" },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(upstream.mock.calls[0][1].method).toBe("POST");
    expect(upstream.mock.calls[1][1].method).toBe("GET");
    expect(upstream.mock.calls[1][1].body).toBeUndefined();
    expect(upstream.mock.calls[1][1].headers["content-type"]).toBeUndefined();
  });

  it("gives up on a redirect loop", async () => {
    const upstream = vi.fn().mockImplementation(async () => redirect("https://v3-cinemeta.strem.io/again"));
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await handler(request("https://v3-cinemeta.strem.io/start"), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "too many upstream redirects" });
    expect(upstream).toHaveBeenCalledTimes(6);
  });

  it("stops reading a body of unknown length once it passes the limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const endless = new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    }, { highWaterMark: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(endless, { status: 200 })));
    const res = responseMock();

    await handler(request("https://addon.elfhosted.com/huge"), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "upstream response too large" });
    expect(pulled).toBeLessThanOrEqual(12);
  });

  it("keeps the deadline while the body is still arriving", async () => {
    vi.useFakeTimers();
    const stalled = new ReadableStream({ pull() { return new Promise(() => {}); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stalled, { status: 200 })));
    const res = responseMock();

    const done = handler(request("https://addon.elfhosted.com/slow"), res);
    await vi.advanceTimersByTimeAsync(25_000);
    await done;

    expect(res.statusCode).toBe(504);
    expect(res.body).toEqual({ error: "upstream timeout" });
  });
});
