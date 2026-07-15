import { describe, expect, it } from "vitest";
import {
  privateBetaAr,
  privateBetaDe,
  privateBetaEn,
  privateBetaEs,
  privateBetaFr,
  privateBetaIt,
  privateBetaPt,
} from "./private-beta";

const localized = { ar: privateBetaAr, de: privateBetaDe, es: privateBetaEs, fr: privateBetaFr, it: privateBetaIt, pt: privateBetaPt };
const placeholders = (value: string) => [...value.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort();

describe("private beta locale parity", () => {
  it.each(Object.entries(localized))("%s contains every key with matching placeholders", (_language, catalog) => {
    expect(Object.keys(privateBetaEn).filter((key) => !(key in catalog))).toEqual([]);
    for (const [key, english] of Object.entries(privateBetaEn)) {
      expect(placeholders(catalog[key]), key).toEqual(placeholders(english));
    }
  });
});
