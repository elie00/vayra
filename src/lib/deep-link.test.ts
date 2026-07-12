import { describe, expect, it } from "vitest";
import { parseVayraAuthCallback } from "./deep-link";

describe("VAYRA auth callback deep links", () => {
  it("accepts an authorization-code callback", () => {
    const url = "vayra://auth/callback?code=pkce-code";
    expect(parseVayraAuthCallback(url)).toBe(url);
  });

  it("accepts provider errors so the UI can surface them", () => {
    const url = "vayra://auth/callback?error=access_denied&error_description=Expired";
    expect(parseVayraAuthCallback(url)).toBe(url);
  });

  it("rejects unrelated VAYRA and foreign links", () => {
    expect(parseVayraAuthCallback("vayra://detail/movie/tt123")).toBeNull();
    expect(parseVayraAuthCallback("harbor://auth/callback?code=legacy")).toBeNull();
    expect(parseVayraAuthCallback("https://example.com/auth/callback?code=web")).toBeNull();
  });
});
