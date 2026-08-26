import { afterEach, describe, expect, it, vi } from "vitest";
import imdbHandler from "./imdb/[...path].js";
import artworkHandler from "./tvdb/artwork.js";
import tvdbV4Handler from "./tvdb/v4/[...path].js";

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

function get(overrides = {}) {
  const octet = Math.floor(Math.random() * 200) + 1;
  return {
    method: "GET",
    headers: { "x-forwarded-for": `192.0.2.${octet}` },
    query: {},
    url: "/",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("metadata proxy handlers", () => {
  it("rejects unsupported TVDB API routes without spending credentials", async () => {
    vi.stubEnv("TVDB_API_KEY", "tvdb-key");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await tvdbV4Handler(
      get({ query: { path: ["users", "1"] }, url: "/api/tvdb/v4/users/1" }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps only supported TVDB query parameters and times out upstream calls", async () => {
    vi.stubEnv("TVDB_API_KEY", "tvdb-key");
    const upstream = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { token: "token" } }) })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => '{"data":[]}',
        headers: { get: () => "application/json" },
      });
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await tvdbV4Handler(
      get({
        query: { path: ["series", "123", "episodes", "default"] },
        url: "/api/tvdb/v4/series/123/episodes/default?page=2&secret=ignored",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(upstream.mock.calls[1][0]).toBe(
      "https://api4.thetvdb.com/v4/series/123/episodes/default?page=2",
    );
    expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(upstream.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects ambiguous artwork identifiers before calling TVDB", async () => {
    vi.stubEnv("TVDB_API_KEY", "tvdb-key");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = responseMock();

    await artworkHandler(get({ query: { series: ["1", "2"] } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ backgrounds: [], clearLogos: [], posters: [] });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("enforces GET and a request-wide timeout on IMDb", async () => {
    const rejected = responseMock();
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { title: { ratingsSummary: { aggregateRating: 8.4 } } } }),
    });
    vi.stubGlobal("fetch", upstream);

    await imdbHandler({ ...get(), method: "POST" }, rejected);
    expect(rejected.statusCode).toBe(405);
    expect(upstream).not.toHaveBeenCalled();

    const accepted = responseMock();
    await imdbHandler(
      get({ query: { path: ["title", "tt1234567"] }, url: "/api/imdb/title/tt1234567" }),
      accepted,
    );
    expect(accepted.body).toEqual({ rating: 8.4 });
    expect(upstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
