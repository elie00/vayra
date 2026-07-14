import { describe, expect, it } from "vitest";
import { lumaAr, lumaDe, lumaEn, lumaEs, lumaFr, lumaIt, lumaPt } from "./luma";

describe("LUMA locale parity", () => {
  for (const [locale, catalog] of Object.entries({ ar: lumaAr, de: lumaDe, en: lumaEn, es: lumaEs, fr: lumaFr, it: lumaIt, pt: lumaPt })) {
    it(`${locale} contains every LUMA key`, () => {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(lumaEn).sort());
      for (const value of Object.values(catalog)) expect(value.trim().length).toBeGreaterThan(0);
    });
  }
});

