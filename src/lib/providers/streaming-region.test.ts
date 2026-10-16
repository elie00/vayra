import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("./tmdb/tmdb-client", () => ({ get }));

import { catalogRegion } from "./streaming";

// TMDB's watch/providers lists what each region offers.
const offered: Record<string, number[]> = { FR: [8, 337, 119, 350, 531, 283], US: [8, 15, 337, 9, 386], CA: [8, 15] };

beforeEach(() => {
  get.mockReset().mockImplementation(async (_key: string, path: string, params: Record<string, string>) =>
    path.startsWith("watch/providers/")
      ? { results: (offered[params.watch_region] ?? []).map((provider_id) => ({ provider_id })) }
      : null,
  );
});

describe("catalogRegion", () => {
  it("keeps the user's region for a service offered there", async () => {
    expect(await catalogRegion("k", "netflix", "FR")).toBe("FR");
    expect(await catalogRegion("k", "prime", "FR")).toBe("FR");
  });

  it("shows the US catalog of a service the region does not offer", async () => {
    expect(await catalogRegion("k", "hulu", "FR")).toBe("US");
    expect(await catalogRegion("k", "peacock", "FR")).toBe("US");
  });

  it("asks TMDB once per region and keeps the region when the list is unavailable", async () => {
    expect(await catalogRegion("k", "hulu", "CA")).toBe("CA");
    await catalogRegion("k", "netflix", "CA");
    // One movie and one TV provider list, then the cached answer.
    expect(get.mock.calls.filter(([, , p]) => p.watch_region === "CA")).toHaveLength(2);
    get.mockResolvedValue(null);
    expect(await catalogRegion("k", "hulu", "DE")).toBe("DE");
  });
});
