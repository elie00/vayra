import { expect, it } from "vitest";
import { regionName } from "./region-name";

it("names a country in the interface language", () => {
  expect(regionName("ZA", "South Africa", "fr")).toBe("Afrique du Sud");
  expect(regionName("ZA", "South Africa", "en")).toBe("South Africa");
});

it("keeps the given label for a code that is not a region", () => {
  expect(regionName("not a code", "Somewhere", "fr")).toBe("Somewhere");
});
