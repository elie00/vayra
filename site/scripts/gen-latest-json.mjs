#!/usr/bin/env node
// gen-latest-json.mjs — generate public/updates/latest.json for the Tauri updater.
//
// The Tauri updater plugin (tauri-plugin-updater v2, configured in the VAYRA app at
// src-tauri/tauri.conf.json -> plugins.updater.endpoints = ["https://vayra.eybo.tech/updates/latest.json"])
// fetches this JSON and, for the running platform key, downloads `url` and verifies it
// against `signature` using the minisign PUBLIC key baked into tauri.conf. The signature
// is the RAW CONTENTS of the `.sig` file that `tauri build` emits next to each update
// artifact (created only when the build is run with TAURI_SIGNING_PRIVATE_KEY set, or
// bundle.createUpdaterArtifacts = true). This script does NOT sign anything — it only
// assembles the manifest from `.sig` files you already have.
//
// USAGE:
//   node scripts/gen-latest-json.mjs --tag v0.9.36 --sig-dir ./sigs [--notes "..."] [--repo elie00/vayra] [--out public/updates/latest.json]
//
// --tag       Git tag of the GitHub release (e.g. v0.9.36). The leading "v" is stripped
//             to derive the version and to build artifact filenames.
// --sig-dir   Directory containing the *.sig files downloaded from the release assets.
// --notes     Release notes string (optional). If omitted, a placeholder is written.
// --repo      GitHub owner/repo (default: elie00/vayra).
// --out       Output path (default: public/updates/latest.json relative to repo root).
//
// The mapping below assumes the DEFAULT Tauri v2 artifact names. If your CI renames
// artifacts, adjust `PLATFORMS[].sig` / `PLATFORMS[].asset` accordingly.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.tag || !args["sig-dir"]) {
  console.error(
    "Missing required args.\n" +
      "USAGE: node scripts/gen-latest-json.mjs --tag v0.9.36 --sig-dir ./sigs [--notes \"...\"] [--repo elie00/vayra] [--out public/updates/latest.json]",
  );
  process.exit(1);
}

const tag = args.tag;
const version = tag.replace(/^v/, "");
const repo = args.repo || "elie00/vayra";
const sigDir = resolve(args["sig-dir"]);
const notes = args.notes || `Release ${tag}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(args.out ? args.out : join(repoRoot, "public/updates/latest.json"));

// Tauri updater platform keys -> the update artifact filename and its sidecar .sig.
// {v} is replaced by the version (no leading "v"). These are the DEFAULT Tauri v2 names.
const PLATFORMS = [
  {
    key: "darwin-aarch64",
    asset: "VAYRA_aarch64.app.tar.gz",
    sig: "VAYRA_aarch64.app.tar.gz.sig",
  },
  {
    key: "darwin-x86_64",
    asset: "VAYRA_x64.app.tar.gz",
    sig: "VAYRA_x64.app.tar.gz.sig",
  },
  {
    key: "linux-x86_64",
    asset: "VAYRA_{v}_amd64.AppImage",
    sig: "VAYRA_{v}_amd64.AppImage.sig",
  },
  {
    key: "windows-x86_64",
    asset: "VAYRA_{v}_x64-setup.exe",
    sig: "VAYRA_{v}_x64-setup.exe.sig",
  },
];

const subst = (s) => s.replace(/\{v\}/g, version);
const assetUrl = (asset) =>
  `https://github.com/${repo}/releases/download/${tag}/${subst(asset)}`;

const platforms = {};
const missing = [];
for (const p of PLATFORMS) {
  const sigFile = join(sigDir, subst(p.sig));
  if (!existsSync(sigFile)) {
    missing.push(subst(p.sig));
    continue;
  }
  const signature = readFileSync(sigFile, "utf8").trim();
  platforms[p.key] = { signature, url: assetUrl(p.asset) };
}

if (Object.keys(platforms).length === 0) {
  console.error(
    `No .sig files found in ${sigDir}. Expected any of:\n  ` +
      PLATFORMS.map((p) => subst(p.sig)).join("\n  "),
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.warn(
    `WARNING: no .sig for ${missing.join(", ")} — those platforms are omitted from latest.json ` +
      `(the updater will report "no update" for them).`,
  );
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`  version:   ${version}`);
console.log(`  platforms: ${Object.keys(platforms).join(", ")}`);
