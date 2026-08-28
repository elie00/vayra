import { describe, expect, it } from "vitest";
import {
  isVayraWebAuthCallback,
  normalizeVayraAuthUrl,
  vayraAuthRedirectUrl,
} from "./vayra-auth-url";

describe("VAYRA account callback URLs", () => {
  it("uses an HTTPS callback for Lite and the app scheme for Tauri", () => {
    expect(vayraAuthRedirectUrl({ tauri: false, origin: "https://vayra.eybo.tech/" })).toBe(
      "https://vayra.eybo.tech/auth/callback",
    );
    expect(vayraAuthRedirectUrl({ tauri: true, origin: "https://vayra.eybo.tech" })).toBe(
      "vayra://auth/callback",
    );
  });

  it("repairs HTML entities copied with an email link", () => {
    expect(normalizeVayraAuthUrl(" https://vayra.eybo.tech/auth/callback?code=a&amp;x=1&#x20; ")).toBe(
      "https://vayra.eybo.tech/auth/callback?code=a&x=1",
    );
  });

  it("accepts only the callback path on the current Lite origin", () => {
    expect(
      isVayraWebAuthCallback(
        new URL("https://vayra.eybo.tech/auth/callback?code=ok"),
        "https://vayra.eybo.tech",
      ),
    ).toBe(true);
    expect(
      isVayraWebAuthCallback(
        new URL("https://attacker.example/auth/callback?code=no"),
        "https://vayra.eybo.tech",
      ),
    ).toBe(false);
  });
});
