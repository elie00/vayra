import { describe, expect, it } from "vitest";
import {
  parseCiraGroupInviteCode,
  parseCiraInviteCode,
  parseVaraInviteCode,
  parseVayraAuthCallback,
} from "./deep-link";

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

describe("CIRA group invite deep links", () => {
  it("extracts only fragment codes from the dedicated group route", () => {
    expect(parseCiraGroupInviteCode("vayra://cira/group#t=CIRAG-AB12")).toBe("CIRAG-AB12");
    expect(parseCiraGroupInviteCode("vayra://cira/group?t=CIRAG-AB12")).toBeNull();
    expect(parseCiraGroupInviteCode("vayra://cira/invite#t=CIRAG-AB12")).toBeNull();
    expect(parseCiraGroupInviteCode("harbor://cira/group#t=CIRAG-AB12")).toBeNull();
  });
});

describe("CIRA invite deep links", () => {
  it("extracts and normalises one valid fragment code", () => {
    expect(parseCiraInviteCode("vayra://cira/invite#t=ciraab12cd34ef56gh78jk90")).toBe(
      "CIRA-AB12-CD34-EF56-GH78-JK90",
    );
  });

  it("rejects other schemes, hosts, paths, and missing codes", () => {
    expect(parseCiraInviteCode("vayra://cira/invite")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite#t=")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite?t=QUERY")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite#x=1&t=CIRA-AB12-CD34-EF56-GH78-JK90")).toBeNull();
    expect(parseCiraInviteCode("vayra://cira/invite#t=AB%2D12")).toBeNull();
    expect(parseCiraInviteCode("vayra://auth/callback?code=x")).toBeNull();
    expect(parseCiraInviteCode("harbor://cira/invite#t=AB12")).toBeNull();
    expect(parseCiraInviteCode("https://vayra.eybo.tech/cira/invite#t=AB12")).toBeNull();
  });
});

describe("VARA room invite deep links", () => {
  it("accepts only a fragment secret on the dedicated route", () => {
    const code = "VARA0123456789ABCDEFGHJK";
    expect(parseVaraInviteCode(`vayra://vara/invite#t=${code}`)).toBe(code);
    expect(parseVaraInviteCode(`vayra://vara/invite?t=${code}`)).toBeNull();
    expect(parseVaraInviteCode(`vayra://cira/invite#t=${code}`)).toBeNull();
    expect(parseVaraInviteCode(`harbor://vara/invite#t=${code}`)).toBeNull();
    expect(parseVaraInviteCode("vayra://vara/invite#t=VARA-AB12")).toBeNull();
  });
});
