import { describe, expect, it } from "vitest";
import { clearRecentErrors, getRecentErrors, redactSensitive } from "./bug-report";

describe("redactSensitive", () => {
  it("lets the user erase the in-memory diagnostic", () => {
    clearRecentErrors();
    expect(getRecentErrors()).toEqual([]);
  });

  it("strips http(s) URLs (addon transport, subtitle, stream)", () => {
    const out = redactSensitive(
      "failed https://stremio.torbox.app/deadbeefcafebabe/manifest.json loading",
    );
    expect(out).not.toContain("torbox.app");
    expect(out).not.toContain("deadbeefcafebabe");
    expect(out).toContain("[url]");
  });

  it("strips stremio:// and file:// and ws:// URLs", () => {
    expect(redactSensitive("open stremio://detail/movie/tt0111161")).toContain("[url]");
    expect(redactSensitive("read file:///Users/x/Movies/thing.mkv")).toContain("[url]");
    expect(redactSensitive("socket ws://relay.example/abc")).toContain("[url]");
  });

  it("strips magnet links and long hex tokens (info-hash / api key)", () => {
    expect(redactSensitive("magnet:?xt=urn:btih:0123456789abcdef0123")).toContain("[magnet]");
    const out = redactSensitive("key 0123456789abcdef0123456789abcdef done");
    expect(out).toContain("[hash]");
    expect(out).not.toContain("0123456789abcdef");
  });

  it("strips VAYRA deep links, invite codes, IP addresses and local paths", () => {
    const out = redactSensitive(
      "open vayra://cira/invite#t=CIRA-AB12-CD34-EF56-GH78-JK90 from 192.168.1.4 at /Users/eybo/Movies/a.mkv",
    );
    expect(out).not.toContain("AB12-CD34");
    expect(out).not.toContain("192.168.1.4");
    expect(out).not.toContain("/Users/eybo");
    expect(out).toContain("[url]");
    expect(out).toContain("[ip]");
    expect(out).toContain("[path]");
  });

  it("leaves ordinary error text intact", () => {
    expect(redactSensitive("TypeError: cannot read property x of undefined")).toBe(
      "TypeError: cannot read property x of undefined",
    );
  });
});
