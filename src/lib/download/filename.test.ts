import { describe, expect, it } from "vitest";
import { sanitizeName } from "./filename";

describe("sanitizeName", () => {
  it("removes what Windows refuses in a name", () => {
    expect(sanitizeName('Alien: Romulus?')).toBe("Alien Romulus");
    expect(sanitizeName("Fin du film. ")).toBe("Fin du film");
  });

  it("does not leave a space or a dot where a long name is cut", () => {
    const cut = sanitizeName(`${"a".repeat(179)} b`);
    expect(cut).toBe("a".repeat(179));
  });

  it("renames the names Windows reserves", () => {
    expect(sanitizeName("Nul")).toBe("_Nul");
    expect(sanitizeName("con")).toBe("_con");
    expect(sanitizeName("COM1.2020")).toBe("_COM1.2020");
    expect(sanitizeName("Console")).toBe("Console");
  });

  it("never returns an empty name", () => {
    expect(sanitizeName("???")).toBe("video");
  });
});
