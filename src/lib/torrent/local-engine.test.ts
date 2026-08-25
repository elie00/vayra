import { describe, expect, it } from "vitest";
import { engineFileFromUrl } from "./local-engine";

describe("engineFileFromUrl", () => {
  it("reads the hash and file index out of an engine stream URL", () => {
    expect(
      engineFileFromUrl("http://127.0.0.1:11470/stream/0123456789abcdef0123456789abcdef01234567/12"),
    ).toEqual({ infoHash: "0123456789abcdef0123456789abcdef01234567", fileIdx: 12 });
  });

  it("lowercases the hash and ignores a query string", () => {
    expect(
      engineFileFromUrl("http://h/0123456789ABCDEF0123456789ABCDEF01234567/0?tr=udp%3A%2F%2Ft"),
    ).toEqual({ infoHash: "0123456789abcdef0123456789abcdef01234567", fileIdx: 0 });
  });

  it("returns null for anything that is not a torrent file URL", () => {
    expect(engineFileFromUrl("https://cdn.example/video.mkv")).toBeNull();
    expect(engineFileFromUrl("http://h/0123456789abcdef/3")).toBeNull();
    expect(engineFileFromUrl("http://h/0123456789abcdef0123456789abcdef01234567/x")).toBeNull();
  });
})
