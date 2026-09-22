import { describe, expect, it } from "vitest";
import { localizedLanguageName } from "./language-label";

describe("localized language labels", () => {
  it("shows French labels without changing stored English language identifiers", () => {
    expect(localizedLanguageName("French", "fr")).toBe("Français");
    expect(localizedLanguageName("English", "fr")).toBe("Anglais");
    expect(localizedLanguageName("Portuguese (Brazil)", "fr")).toContain("Portugais");
    expect(localizedLanguageName("Spanish (Latin America)", "fr")).toContain("Espagnol");
  });
  it("preserves unknown names and supports switching interface language", () => {
    expect(localizedLanguageName("Original", "fr")).toBe("Original");
    expect(localizedLanguageName("French", "en")).toBe("French");
  });
});
