import { describe, expect, it } from "vitest";
import { parseCiraInviteCode, parseVayraAuthCallback } from "./deep-link";

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

describe("CIRA invite deep links", () => {
  it("extracts the code from the fragment", () => {
    expect(parseCiraInviteCode("vayra://cira/invite#t=CIRA-AB12-CD34")).toBe("CIRA-AB12-CD34");
    expect(parseCiraInviteCode("vayra://cira/invite#x=1&t=ab12")).toBe("ab12");
  });

  it("decodes percent-encoded fragments", () => {
    expect(parseCiraInviteCode("vayra://cira/invite#t=AB%2D12")).toBe("AB-12");
  });

  it("rejects other schemes, hosts, paths, and missing codes", () => {
    expect(parseCiraInviteCode("vayra://cira/invite")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite#t=")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite?t=QUERY")).toBeNull();
    expect(parseCiraInviteCode("vayra://auth/callback?code=x")).toBeNull();
    expect(parseCiraInviteCode("harbor://cira/invite#t=AB12")).toBeNull();
    expect(parseCiraInviteCode("https://vayra.eybo.tech/cira/invite#t=AB12")).toBeNull();
  });
});
