import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  getCachedCatalog: vi.fn(),
  getCachedManifest: vi.fn(),
  getCachedMeta: vi.fn(),
  setCachedCatalog: vi.fn(),
  setCachedManifest: vi.fn(),
  setCachedMeta: vi.fn(),
}));

vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("./cache", () => ({
  getCachedCatalog: mocks.getCachedCatalog,
  getCachedManifest: mocks.getCachedManifest,
  getCachedMeta: mocks.getCachedMeta,
  setCachedCatalog: mocks.setCachedCatalog,
  setCachedManifest: mocks.setCachedManifest,
  setCachedMeta: mocks.setCachedMeta,
}));

import {
  StremboxdClient,
  validateStremboxdConfig,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCachedCatalog.mockReturnValue(undefined);
  mocks.getCachedManifest.mockReturnValue(undefined);
  mocks.getCachedMeta.mockReturnValue(undefined);
});

describe("Stremboxd client decisions", () => {
  it("validates a manifest and requires the requested watchlist", async () => {
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({
      id: "community.stremboxd",
      catalogs: [{ id: "letterboxd-watchlist" }, { id: "letterboxd-popular" }],
    }));

    await expect(validateStremboxdConfig("config", true)).resolves.toEqual({
      ok: true,
      catalogs: 2,
      hasWatchlist: true,
    });

    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({
      id: "community.stremboxd",
      catalogs: [{ id: "letterboxd-popular" }],
    }));
    await expect(validateStremboxdConfig("config", true)).resolves.toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("distinguishes malformed, empty and unreachable configurations", async () => {
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({ id: "other-addon", catalogs: [{}] }));
    await expect(validateStremboxdConfig("config", false)).resolves.toMatchObject({
      ok: false,
      reason: "invalid",
    });

    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({ id: "community.stremboxd", catalogs: [] }));
    await expect(validateStremboxdConfig("config", false)).resolves.toMatchObject({
      ok: false,
      reason: "no-catalogs",
    });

    mocks.safeFetch.mockRejectedValueOnce(new TypeError("offline"));
    await expect(validateStremboxdConfig("config", false)).resolves.toMatchObject({
      ok: false,
      reason: "network",
    });
  });

  it("turns HTTP failures into a stable validation result", async () => {
    mocks.safeFetch.mockResolvedValueOnce(new Response("bad configuration", { status: 400 }));
    await expect(validateStremboxdConfig("config", false)).resolves.toEqual({
      ok: false,
      reason: "invalid",
      message: "Invalid configuration.",
    });
  });

  it("detects catalog pagination at the protocol page boundary", async () => {
    const metas = Array.from({ length: 100 }, (_, index) => ({ id: `tt${index}` }));
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({ metas }));

    const page = await new StremboxdClient("config").getCatalog("popular", 100);

    expect(page).toEqual({ metas, hasMore: true });
    expect(mocks.safeFetch).toHaveBeenCalledWith(expect.stringContaining("/skip=100.json"));
    expect(mocks.setCachedCatalog).toHaveBeenCalledWith("config:popular:100", page);
  });

  it("uses cached manifests without issuing a request", async () => {
    const manifest = { id: "community.stremboxd", catalogs: [] };
    mocks.getCachedManifest.mockReturnValueOnce(manifest);

    await expect(new StremboxdClient("config").getManifest()).resolves.toBe(manifest);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});
