import { describe, expect, it } from "vitest";
import en from "./en";
import de from "./de";

describe("de locale parity", () => {
  it("has every key from the canonical en catalog", () => {
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
  });

  it("preserves the {n} interpolation placeholder", () => {
    expect(de["Episode {n}"]).toContain("{n}");
    expect(de["{n} min"]).toContain("{n}");
  });
});
