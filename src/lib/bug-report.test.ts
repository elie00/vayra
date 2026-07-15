import { describe, expect, it } from "vitest";
import { redactSensitive } from "./bug-report";

describe("redactSensitive", () => {
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

  it("leaves ordinary error text intact", () => {
    expect(redactSensitive("TypeError: cannot read property x of undefined")).toBe(
      "TypeError: cannot read property x of undefined",
    );
  });
});
