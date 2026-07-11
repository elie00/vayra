import { describe, expect, it } from "vitest";
import { normalizeInstallUrl, trustedInstallerMessage } from "./installer-message";

describe("normalizeInstallUrl", () => {
  it("converts Stremio links to HTTPS", () => {
    expect(normalizeInstallUrl(" stremio://addon.example/manifest.json ")).toBe(
      "https://addon.example/manifest.json",
    );
  });
});

describe("trustedInstallerMessage", () => {
  const iframeWindow = {} as Window;
  const event = (overrides: Partial<MessageEvent> = {}) => ({
    data: { manifestUrl: "https://addon.example/manifest.json" },
    origin: "https://addon.example",
    source: iframeWindow,
    ...overrides,
  }) as MessageEvent;

  it("accepts a manifest from the expected iframe and origin", () => {
    expect(
      trustedInstallerMessage(event(), iframeWindow, "https://addon.example/configure"),
    ).toBe("https://addon.example/manifest.json");
  });

  it("rejects messages from another window or origin", () => {
    expect(
      trustedInstallerMessage(event({ source: {} as Window }), iframeWindow, "https://addon.example"),
    ).toBeNull();
    expect(
      trustedInstallerMessage(event({ origin: "https://evil.example" }), iframeWindow, "https://addon.example"),
    ).toBeNull();
  });

  it("rejects non-manifest URLs", () => {
    expect(
      trustedInstallerMessage(
        event({ data: "https://addon.example/configure" }),
        iframeWindow,
        "https://addon.example",
      ),
    ).toBeNull();
  });
});
