// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { emitOpenMagnet, isMagnetLink, onOpenMagnet, parseTorrentFileUrl } from "./deep-link";

describe("magnet links and .torrent files opened from macOS", () => {
  it("recognises magnet links only", () => {
    expect(isMagnetLink("magnet:?xt=urn:btih:de89f34ab990f4431cfb91329b7ab4190807bb08")).toBe(true);
    expect(isMagnetLink("MAGNET:?xt=urn:btih:de89f34ab990f4431cfb91329b7ab4190807bb08")).toBe(true);
    expect(isMagnetLink("vayra://magnet")).toBe(false);
  });

  it("reads the path of a .torrent file and nothing else", () => {
    expect(parseTorrentFileUrl("file:///Users/me/Downloads/Mon%20film.torrent")).toBe("/Users/me/Downloads/Mon film.torrent");
    expect(parseTorrentFileUrl("file:///Users/me/Downloads/film.mkv")).toBeNull();
    expect(parseTorrentFileUrl("https://example.com/film.torrent")).toBeNull();
  });

  it("hands a magnet received at cold start to the first listener only", () => {
    const magnet = "magnet:?xt=urn:btih:de89f34ab990f4431cfb91329b7ab4190807bb08";
    emitOpenMagnet(magnet);
    const received: string[] = [];
    const stop = onOpenMagnet((m) => received.push(m));
    const stopLate = onOpenMagnet((m) => received.push(`late ${m}`));
    expect(received).toEqual([magnet]);
    stop();
    stopLate();
  });
});
