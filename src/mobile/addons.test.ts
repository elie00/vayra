import { expect, it, vi } from "vitest";
import type { ResolvedAddon } from "@/lib/addons-store/store";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, t: (key: string) => key }));

const { playbackSourceCount, sectionAddons } = await import("./addons");

const curated = (id: string, category: string, recommended: number, extra: Partial<NonNullable<ResolvedAddon["curated"]>> = {}): ResolvedAddon => ({
  curated: { id, transportUrl: `https://${id}/manifest.json`, category, tags: [], rails: [], recommended, ...extra } as NonNullable<ResolvedAddon["curated"]>,
  manifest: null,
  transportUrl: `https://${id}/manifest.json`,
  source: "curated",
  installed: false,
});

it("counts only enabled addons that can find something to play", () => {
  const installed = [curated("torrentio", "streams", 99), curated("comet", "streams", 90), curated("subs", "subtitles", 80)];
  expect(playbackSourceCount(installed, () => true)).toBe(2);
  expect(playbackSourceCount(installed, (url) => !url.includes("comet"))).toBe(1);
});

it("lists a section's curated addons, most recommended first, never adult ones", () => {
  const all = [
    curated("low", "streams", 10),
    curated("top", "streams", 99),
    curated("subs", "subtitles", 50),
    curated("nsfw", "streams", 100, { nsfw: true }),
  ];
  expect(sectionAddons(all, ["streams"]).map((r) => r.curated?.id)).toEqual(["top", "low"]);
});
