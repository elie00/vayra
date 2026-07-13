import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "..", "src", "assets", "brand", "vayra");

function brandedSvg(name, sourceColor, fill) {
  return readFileSync(join(assets, name), "utf8").replaceAll(sourceColor, fill);
}

function dataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function wordmarkTextSvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 429 62"><g fill="${fill}">
    <path d="M0 0h12l20 47L52 0h12L38 62H26Z"/>
    <path fill-rule="evenodd" d="M103 62H91l25-62h13l25 62h-12l-6-15h-27Zm10-25h19l-9-24Z"/>
    <path d="M180 0h13l17 25 17-25h13l-24 36v26h-12V36Z"/>
    <path fill-rule="evenodd" d="M278 0h28c17 0 27 8 27 22 0 10-5 17-15 20l18 20h-15l-16-18h-15v18h-12Zm12 10v24h16c10 0 15-4 15-12s-5-12-15-12Z"/>
    <path fill-rule="evenodd" d="M378 62h-12l25-62h13l25 62h-12l-6-15h-27Zm10-25h19l-9-24Z"/>
  </g></svg>`;
}

function writeBmp24(path, width, height, rgba) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelBytes = rowSize * height;
  const out = Buffer.alloc(54 + pixelBytes);
  out.write("BM", 0);
  out.writeUInt32LE(54 + pixelBytes, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(pixelBytes, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    let offset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const source = (srcY * width + x) * 4;
      out[offset++] = rgba[source + 2];
      out[offset++] = rgba[source + 1];
      out[offset++] = rgba[source];
    }
  }
  writeFileSync(path, out);
}

function renderInstallerAsset(svg, basename) {
  const image = new Resvg(svg).render();
  writeFileSync(join(here, `${basename}-preview.png`), image.asPng());
  writeBmp24(join(here, `${basename}.bmp`), image.width, image.height, image.pixels);
}

function sidebar() {
  const wordmark = dataUri(wordmarkTextSvg("#F4F2ED"));
  renderInstallerAsset(
    `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1f26"/><stop offset=".55" stop-color="#15171c"/><stop offset="1" stop-color="#0d0f13"/></linearGradient></defs>
      <rect width="164" height="314" fill="url(#g)"/>
      <g transform="translate(39 81) scale(.16796875)" fill="#F4F2ED">
        <path d="M170 74C99 91 62 154 76 225c14 73 85 142 211 207-61-49-105-94-129-137-42-74-37-161 12-221Z"/>
        <path d="M342 74c71 17 108 80 94 151-14 73-85 142-211 207 61-49 105-94 129-137 42-74 37-161-12-221Z"/>
      </g>
      <image href="${wordmark}" x="21" y="195" width="122" height="39"/>
    </svg>`,
    "sidebar",
  );
}

function header() {
  const mark = dataUri(brandedSvg("vayra-mark-dark.svg", "#0A0B0D", "#111214"));
  renderInstallerAsset(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57">
      <rect width="150" height="57" fill="#ffffff"/>
      <image href="${mark}" x="16" y="10.5" width="36" height="36"/>
    </svg>`,
    "header",
  );
}

sidebar();
header();
console.log("done");
