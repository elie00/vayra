import { afterEach, describe, expect, it, vi } from "vitest";
import { pathSeparator } from "./platform";

afterEach(() => vi.unstubAllGlobals());

describe("pathSeparator", () => {
  it("uses backslashes on Windows", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" });
    expect(pathSeparator()).toBe("\\");
  });

  it("uses slashes on macOS and Linux", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    expect(pathSeparator()).toBe("/");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" });
    expect(pathSeparator()).toBe("/");
  });

  it("still recognises Windows from a frozen platform string", () => {
    // Browsers have begun reducing navigator.platform; the user agent carries it.
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "" });
    expect(pathSeparator()).toBe("\\");
  });

  it("does not throw when the platform is missing entirely", () => {
    // navigator.platform is deprecated: reading it unguarded used to throw here.
    vi.stubGlobal("navigator", { userAgent: "" });
    expect(pathSeparator()).toBe("/");
  });
})
