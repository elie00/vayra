import { describe, expect, it } from "vitest";
import {
  CIRA_DISCOVER_ORIGIN,
  decodeCiraQrPixels,
  formatCiraInviteCode,
  parseCiraDiscoverPayload,
} from "./discover";

const CODE = "CIRA-AB12-CD34-EF56-GH78-JK90";

describe("CIRA Discover payloads", () => {
  it("accepts an exact official HTTPS fragment", () => {
    expect(parseCiraDiscoverPayload(`${CIRA_DISCOVER_ORIGIN}/cira/invite#t=${CODE}`)).toEqual({
      code: CODE,
      canonicalUrl: `${CIRA_DISCOVER_ORIGIN}/cira/invite#t=${CODE}`,
      source: "https",
    });
  });

  it("accepts the dedicated deep link and a manual code", () => {
    expect(parseCiraDiscoverPayload(`vayra://cira/invite#t=${CODE}`)?.source).toBe("deep-link");
    expect(parseCiraDiscoverPayload("cira ab12 cd34 ef56 gh78 jk90")).toEqual({
      code: CODE,
      canonicalUrl: `${CIRA_DISCOVER_ORIGIN}/cira/invite#t=${CODE}`,
      source: "code",
    });
  });

  it("rejects queries, extra fragments, foreign origins and lookalike paths", () => {
    const rejected = [
      `${CIRA_DISCOVER_ORIGIN}/cira/invite?t=${CODE}`,
      `${CIRA_DISCOVER_ORIGIN}/cira/invite#t=${CODE}&utm=x`,
      `https://evil.example/cira/invite#t=${CODE}`,
      `${CIRA_DISCOVER_ORIGIN}/cira/invite/extra#t=${CODE}`,
      `harbor://cira/invite#t=${CODE}`,
      `vayra://cira/invite#x=1&t=${CODE}`,
    ];
    for (const value of rejected) expect(parseCiraDiscoverPayload(value), value).toBeNull();
  });

  it("normalises only valid 100-bit Crockford codes", () => {
    expect(formatCiraInviteCode("ciraab12cd34ef56gh78jk90")).toBe(CODE);
    expect(() => formatCiraInviteCode("CIRA-AB12-CD34-EF56-GH78-JK9U")).toThrow();
  });

  it("rejects malformed pixel buffers", () => {
    expect(decodeCiraQrPixels(new Uint8ClampedArray(4), 2, 2)).toBeNull();
  });
});
