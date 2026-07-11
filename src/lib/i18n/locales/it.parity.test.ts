import { describe, expect, it as test } from "vitest";
import en from "./en";
import it from "./it";

describe("Italian interface catalog", () => {
  test("contains every key from the canonical English catalog", () => {
    expect(Object.keys(en).filter((key) => !(key in it))).toEqual([]);
  });

  test("interpolates variables in translated entries", () => {
    const template = it["Guest Stars · {n}"];
    expect(template).toContain("{n}");
    expect(template.split("{n}").join(String(3))).toBe("Guest star · 3");
  });
});
