import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  CIRA_DISCOVER_ORIGIN,
  CiraQrError,
  decodeCiraQrFile,
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

  it("round-trips the production QR payload through the local decoder", () => {
    const url = `${CIRA_DISCOVER_ORIGIN}/cira/invite#t=${CODE}`;
    const modules = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    const quiet = 4;
    const scale = 5;
    const edge = (modules.size + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(edge * edge * 4).fill(255);
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (!modules.get(row, col)) continue;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            const offset = (((row + quiet) * scale + y) * edge + (col + quiet) * scale + x) * 4;
            pixels[offset] = 11;
            pixels[offset + 1] = 12;
            pixels[offset + 2] = 16;
          }
        }
      }
    }
    expect(decodeCiraQrPixels(pixels, edge, edge)).toMatchObject({ code: CODE, source: "https" });
  });

  it("rejects unsafe image inputs before allocating a bitmap", async () => {
    const unsupported = { name: "invite.svg", type: "image/svg+xml", size: 100 } as File;
    const oversized = { name: "invite.png", type: "image/png", size: 9 * 1024 * 1024 } as File;
    await expect(decodeCiraQrFile(unsupported)).rejects.toEqual(new CiraQrError("IMAGE_TYPE_UNSUPPORTED"));
    await expect(decodeCiraQrFile(oversized)).rejects.toEqual(new CiraQrError("IMAGE_TOO_LARGE"));
  });
});
