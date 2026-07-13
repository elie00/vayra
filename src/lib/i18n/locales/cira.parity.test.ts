import { describe, expect, it } from "vitest";
import { ciraAr, ciraDe, ciraEn, ciraEs, ciraFr, ciraIt, ciraPt } from "./cira";

const localized = { ar: ciraAr, de: ciraDe, es: ciraEs, fr: ciraFr, it: ciraIt, pt: ciraPt };

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort();
}

describe("CIRA locale parity", () => {
  it.each(Object.entries(localized))("%s contains every CIRA key", (_language, catalog) => {
    expect(Object.keys(ciraEn).filter((key) => !(key in catalog))).toEqual([]);
  });

  it.each(Object.entries(localized))("%s preserves interpolation variables", (_language, catalog) => {
    for (const [key, english] of Object.entries(ciraEn)) {
      expect(placeholders(catalog[key]), key).toEqual(placeholders(english));
    }
  });
});
