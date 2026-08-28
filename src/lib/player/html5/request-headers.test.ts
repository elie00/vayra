import { describe, expect, it } from "vitest";
import { browserMediaHeaders } from "./request-headers";

describe("HTML5 media request headers", () => {
  it("keeps addon headers that browser loaders may send", () => {
    expect(
      browserMediaHeaders({ Authorization: "Bearer token", "X-Playback-Token": "ready" }),
    ).toEqual({ Authorization: "Bearer token", "X-Playback-Token": "ready" });
  });

  it("drops browser-controlled headers instead of breaking HLS setup", () => {
    expect(
      browserMediaHeaders({ Referer: "https://example.test", Origin: "https://example.test", "Sec-Fetch-Site": "same-site" }),
    ).toEqual({});
  });
});
