import { describe, expect, it } from "vitest";
import en from "./en";
import es from "./es";

describe("Spanish interface catalog", () => {
  it("contains every key from the canonical English catalog", () => {
    expect(Object.keys(en).filter((key) => !(key in es))).toEqual([]);
  });

  it("preserves interpolation placeholders", () => {
    const template = es["Guest Stars · {n}"];
    expect(template).toContain("{n}");
    expect(template.split("{n}").join("3")).toBe("Estrellas invitadas · 3");
  });
});
