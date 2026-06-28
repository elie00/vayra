#!/usr/bin/env node
// Post-build: embarque libmpv.2.dylib + toutes ses deps Homebrew transitives
// dans Harbor.app/Contents/Frameworks et reroute les install_name vers
// @executable_path/../Frameworks (layout macOS standard, sans @rpath).
// A lancer APRES: pnpm exec tauri build --bundles app
// Idempotent. Necessite: brew install dylibbundler
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") {
  console.log("[bundle-libmpv] not macOS, skipping");
  process.exit(0);
}

const APP = resolve(
  process.argv[2] ?? "src-tauri/target/release/bundle/macos/Harbor.app"
);
const BIN = join(APP, "Contents/MacOS/harbor");
const FRAMEWORKS = join(APP, "Contents/Frameworks");

if (!existsSync(BIN)) {
  console.error(`[bundle-libmpv] binary not found: ${BIN}`);
  console.error("[bundle-libmpv] build first: pnpm exec tauri build --bundles app");
  process.exit(1);
}

try {
  execFileSync("dylibbundler", ["--help"], { stdio: "ignore" });
} catch {
  console.error("[bundle-libmpv] dylibbundler not found. Install it:");
  console.error("    brew install dylibbundler");
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const out = (cmd) => execSync(cmd, { encoding: "utf8" });
const loads = (f) => out(`otool -L "${f}"`);

// Les install_name pointent vers @executable_path/../Frameworks (layout macOS
// standard) plutot que @rpath : aucune resolution rpath n'est alors necessaire.
const INSTALL_PREFIX = "@executable_path/../Frameworks/";

// --- Idempotency guard ---
const alreadyBundled =
  existsSync(join(FRAMEWORKS, "libmpv.2.dylib")) &&
  !/\/opt\/homebrew/.test(loads(BIN));
if (alreadyBundled) {
  console.log("[bundle-libmpv] already bundled (binary -> Frameworks/libmpv.2.dylib)");
} else {
  console.log(
    "[bundle-libmpv] dylibbundler: copying libmpv + ~47 transitive dylibs (~60MB)..."
  );
  sh(
    [
      "dylibbundler",
      "--overwrite-files",
      "--bundle-deps",
      "--create-dir",
      `--dest-dir "${FRAMEWORKS}"`,
      `--install-path "${INSTALL_PREFIX}"`,
      `--fix-file "${BIN}"`,
    ].join(" ")
  );
}

const dylibs = existsSync(FRAMEWORKS)
  ? readdirSync(FRAMEWORKS).filter((n) => n.endsWith(".dylib"))
  : [];
const allBinaries = [BIN, ...dylibs.map((f) => join(FRAMEWORKS, f))];

// --- Lister les LC_RPATH d'un binaire (dans l'ordre) ---
const rpathsOf = (f) => {
  const lines = out(`otool -l "${f}"`).split("\n");
  const rpaths = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("LC_RPATH")) {
      const m = (lines[i + 2] || "").match(/^\s*path (.+) \(offset \d+\)/);
      if (m) rpaths.push(m[1]);
    }
  }
  return rpaths;
};

// --- Strip leftover /opt/homebrew LC_RPATH (de build.rs) + DEDUP des rpaths.
//     dylibbundler 1.0.5 ajoute son install-path comme LC_RPATH EN DOUBLE, ce qui
//     fait crasher dyld ("duplicate LC_RPATH"). On supprime homebrew et tout
//     doublon, en gardant une seule occurrence de chaque rpath. ---
const delRpath = (f, rp) => {
  try {
    execSync(`install_name_tool -delete_rpath "${rp}" "${f}" 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
};
for (const f of allBinaries) {
  // homebrew d'abord (inutile une fois les deps embarquees)
  for (const rp of ["/opt/homebrew/lib", "/opt/homebrew/opt/mpv/lib"]) {
    while (delRpath(f, rp)) {
      /* enleve toutes les occurrences */
    }
  }
  // dedup : pour chaque rpath vu plus d'une fois, supprimer les doublons
  const counts = new Map();
  for (const rp of rpathsOf(f)) counts.set(rp, (counts.get(rp) ?? 0) + 1);
  for (const [rp, n] of counts) {
    for (let i = 0; i < n - 1; i++) delRpath(f, rp);
  }
}

// --- Re-codesign ad-hoc (les edits install_name_tool invalident les signatures) ---
console.log("[bundle-libmpv] re-codesigning (ad-hoc)...");
for (const f of dylibs) sh(`codesign --force --sign - "${join(FRAMEWORKS, f)}"`);
sh(`codesign --force --sign - "${BIN}"`);
sh(`codesign --force --deep --sign - "${APP}"`);

// --- Verification ---
console.log("\n[bundle-libmpv] verification:");
const binMpv = loads(BIN)
  .split("\n")
  .filter((l) => /libmpv/.test(l))
  .join("");
console.log(`  harbor -> ${binMpv.trim()}`);

const fails = [];
// (1) plus aucune reference /opt/homebrew (otool -L = load commands)
for (const f of allBinaries) {
  if (/\/opt\/homebrew/.test(loads(f))) fails.push(`/opt/homebrew ref: ${f}`);
}
// (2) le binaire pointe bien sur la libmpv embarquee
if (!/@executable_path\/\.\.\/Frameworks\/libmpv\.2\.dylib/.test(binMpv)) {
  fails.push("harbor ne pointe pas sur @executable_path/../Frameworks/libmpv.2.dylib");
}
// (3) AUCUN LC_RPATH duplique nulle part (sinon dyld crashe au lancement)
for (const f of allBinaries) {
  const rps = rpathsOf(f);
  if (new Set(rps).size !== rps.length) fails.push(`LC_RPATH duplique: ${f}`);
}
if (fails.length) {
  console.error("[bundle-libmpv] FAIL:");
  for (const m of fails) console.error(`    - ${m}`);
  process.exit(1);
}
sh(`codesign --verify --deep --strict "${APP}"`);
console.log(
  `[bundle-libmpv] OK - ${dylibs.length} dylibs embedded, app is Homebrew-free.`
);
