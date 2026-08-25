import { describe, expect, it } from "vitest";
import { languageName, langScore, normalizeLang, pickBestTrack } from "./language";

describe("normalizeLang", () => {
  it("maps three-letter codes to two", () => {
    expect(normalizeLang("fre")).toBe("fr");
    expect(normalizeLang("fra")).toBe("fr");
    expect(normalizeLang("ger")).toBe("de");
  });

  it("reads language names", () => {
    expect(normalizeLang("French")).toBe("fr");
    expect(normalizeLang("  JAPANESE ")).toBe("ja");
  });

  it("keeps Latin American Spanish apart from Spanish", () => {
    expect(normalizeLang("es-419")).toBe("es-419");
    expect(normalizeLang("Latino")).toBe("es-419");
    expect(normalizeLang("es-MX")).toBe("es-419");
    expect(normalizeLang("es-ES")).toBe("es");
  });

  it("keeps Brazilian Portuguese apart from Portuguese", () => {
    expect(normalizeLang("pob")).toBe("pt-br");
    expect(normalizeLang("pt-BR")).toBe("pt-br");
    expect(normalizeLang("por")).toBe("pt");
  });

  it("drops a region that carries no meaning here", () => {
    expect(normalizeLang("fr-CA")).toBe("fr");
    expect(normalizeLang("en_GB")).toBe("en");
  });

  it("gives back what it cannot place", () => {
    expect(normalizeLang("klingon")).toBe("klingon");
    expect(normalizeLang("")).toBe("");
    expect(normalizeLang(null)).toBe("");
  });
});

describe("languageName", () => {
  it("names a code in any of its forms", () => {
    expect(languageName("fre")).toBe("French");
    expect(languageName("pt-BR")).toBe("Portuguese (Brazil)");
  });

  it("shouts back an unknown code rather than hiding it", () => {
    expect(languageName("xx")).toBe("XX");
  });
});

describe("langScore", () => {
  it("ranks by position in the preference list", () => {
    const prefs = ["fr", "en"];
    expect(langScore("fr", prefs)).toBeGreaterThan(langScore("en", prefs));
  });

  it("puts an exact match above a match on the base language", () => {
    const prefs = ["pt-br"];
    expect(langScore("pt-br", prefs)).toBeGreaterThan(langScore("pt", prefs));
  });

  it("rejects a language nobody asked for", () => {
    expect(langScore("de", ["fr", "en"])).toBe(-1);
  });

  it("has no opinion when there are no preferences", () => {
    expect(langScore("de", [])).toBe(0);
  });
});

describe("pickBestTrack", () => {
  it("takes the most preferred language on offer", () => {
    const tracks = [{ lang: "en" }, { lang: "fr" }, { lang: "de" }];
    expect(pickBestTrack(tracks, ["fr", "en"])).toEqual({ lang: "fr" });
  });

  it("leaves forced tracks alone", () => {
    // Forced subtitles only translate the foreign lines, not the dialogue.
    const tracks = [{ lang: "fr", forced: true }, { lang: "en" }];
    expect(pickBestTrack(tracks, ["fr", "en"])).toEqual({ lang: "en" });
  });

  it("breaks a tie with the track marked default", () => {
    const tracks = [{ lang: "fr" }, { lang: "fr", default: true }];
    expect(pickBestTrack(tracks, ["fr"])).toEqual({ lang: "fr", default: true });
  });

  it("falls back to the default track with no preferences set", () => {
    const tracks = [{ lang: "de" }, { lang: "ja", default: true }];
    expect(pickBestTrack(tracks, [])).toEqual({ lang: "ja", default: true });
  });

  it("picks nothing rather than a language nobody asked for", () => {
    expect(pickBestTrack([{ lang: "de" }], ["fr"])).toBeNull();
    expect(pickBestTrack([], ["fr"])).toBeNull();
  });
})
