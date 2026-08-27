#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist";
const ASSETS = join(DIST, "assets");
const KIB = 1024;

if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html is missing; run the production build first");
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const initialAssets = [...html.matchAll(/(?:src|href)="\/(assets\/[^\"]+)"/g)].map(
  ([, asset]) => asset,
);
const assetNames = readdirSync(ASSETS);

function onlyAsset(pattern, label) {
  const matches = assetNames.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one matching asset, found ${matches.length}`);
  }
  return join("assets", matches[0]);
}

function gzipBytes(relativePath) {
  return gzipSync(readFileSync(join(DIST, relativePath)), { level: 9 }).length;
}

function rawBytes(relativePath) {
  return statSync(join(DIST, relativePath)).size;
}

const entryMatch = html.match(/<script type="module"[^>]+src="\/(assets\/[^\"]+\.js)"/);
if (!entryMatch) throw new Error("could not locate the Vite entry chunk");

const checks = [
  {
    label: "initial linked payload",
    bytes: initialAssets.reduce((total, asset) => total + gzipBytes(asset), 0),
    limit: 840 * KIB,
    unit: "gzip",
  },
  { label: "entry JS", bytes: gzipBytes(entryMatch[1]), limit: 650 * KIB, unit: "gzip" },
  {
    label: "settings JS",
    bytes: gzipBytes(onlyAsset(/^settings-.*\.js$/, "settings JS")),
    limit: 325 * KIB,
    unit: "gzip",
  },
  {
    label: "player JS",
    bytes: gzipBytes(onlyAsset(/^player-.*\.js$/, "player JS")),
    limit: 310 * KIB,
    unit: "gzip",
  },
  {
    label: "VAYRA core WASM",
    bytes: gzipBytes(onlyAsset(/^vayra_core_bg-.*\.wasm$/, "VAYRA core WASM")),
    limit: 520 * KIB,
    unit: "gzip",
  },
  {
    label: "default avatar",
    bytes: rawBytes(onlyAsset(/^stremio-default-avatar-.*\.webp$/, "default avatar")),
    limit: 75 * KIB,
    unit: "raw",
  },
];

const eagerlyLinkedLottie = initialAssets.find((asset) => /^assets\/lottie-.*\.js$/.test(asset));
if (eagerlyLinkedLottie) {
  throw new Error(`Lottie must stay lazy but is linked by index.html: ${basename(eagerlyLinkedLottie)}`);
}

let failed = false;
for (const check of checks) {
  const actual = check.bytes / KIB;
  const limit = check.limit / KIB;
  const ok = check.bytes <= check.limit;
  console.log(`${ok ? "PASS" : "FAIL"} ${check.label}: ${actual.toFixed(1)} KiB ${check.unit} / ${limit.toFixed(0)} KiB`);
  failed ||= !ok;
}

if (failed) process.exitCode = 1;
