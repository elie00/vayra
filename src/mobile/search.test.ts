import { expect, it } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { resultTitles } from "./search";

const film = (id: string): Meta => ({ id, type: "movie", name: id });

it("lists the best match first, then each title once", () => {
  const results = {
    topMatch: { meta: film("tt2") },
    movies: [film("tt1"), film("tt2")],
    series: [{ ...film("tt3"), type: "series" }],
    anime: [{ malId: 5, name: "Mob", year: "2016", poster: null, background: null, overview: "", score: 0 }],
  } as unknown as Parameters<typeof resultTitles>[0];
  expect(resultTitles(results).map((m) => m.id)).toEqual(["tt2", "tt1", "tt3", "mal:5"]);
});
