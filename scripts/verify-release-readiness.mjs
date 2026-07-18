#!/usr/bin/env node
import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
  console.error(`release check failed: ${message}`);
  process.exitCode = 1;
};

const packageJson = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const releaseConfig = readJson("src-tauri/tauri.release.conf.json");
const latest = readJson("site/public/updates/latest.json");
const versions = readJson("site/public/updates/versions.json");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const android = readFileSync("src-tauri/gen/android/app/tauri.properties", "utf8");
const site = readFileSync("site/public/index.html", "utf8");
const robots = readFileSync("site/public/robots.txt", "utf8");
const sitemap = readFileSync("site/public/sitemap.xml", "utf8");

const version = packageJson.version;
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const androidName = android.match(/^tauri\.android\.versionName=(.+)$/m)?.[1];
const androidCode = Number(android.match(/^tauri\.android\.versionCode=(\d+)$/m)?.[1]);
const parts = version.split(".").map(Number);
const expectedAndroidCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];

for (const [name, current] of [
  ["Tauri", tauri.version],
  ["Cargo", cargoVersion],
  ["Android versionName", androidName],
]) {
  if (current !== version) fail(`${name} version ${current} differs from package ${version}`);
}
if (androidCode !== expectedAndroidCode) {
  fail(`Android versionCode ${androidCode} should be ${expectedAndroidCode}`);
}

if (tauri.productName !== "VAYRA") fail("Tauri productName must be VAYRA");
if (tauri.identifier !== "app.vayra") fail("Tauri identifier must stay app.vayra");
if (tauri.bundle?.publisher !== "EYBO") fail("bundle publisher must be EYBO");
if (tauri.bundle?.homepage !== "https://vayra.eybo.tech") fail("bundle homepage is not VAYRA");
if (tauri.bundle?.fileAssociations?.some((entry) => /harbor/i.test(entry.name ?? ""))) {
  fail("a visible file-association name still contains Harbor");
}
if (tauri.plugins?.updater?.endpoints?.[0] !== "https://vayra.eybo.tech/updates/latest.json") {
  fail("updater endpoint is not the VAYRA release channel");
}
const legacyUpdaterKey = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEIyNjlEMjU4NjQ4OTM2MjAKUldRZ05vbGtXTkpwc3ZDQnlvZUYyL2VEWHgwODdJa2dkZ2xlNWk3emRWL1V0dXVrcUJlVmhCWEUK";
if (!tauri.plugins?.updater?.pubkey || tauri.plugins.updater.pubkey === legacyUpdaterKey) {
  fail("updater public key is missing or still uses the Harbor key");
}
if (releaseConfig.bundle?.createUpdaterArtifacts !== true) {
  fail("release config does not create updater artifacts");
}
if (!Array.isArray(versions.versions)) fail("versions.json must contain a versions array");
if (/REPLACE_WITH|TEMPLATE/i.test(JSON.stringify(latest))) fail("latest.json contains placeholders");

for (const [name, content] of [["site", site], ["robots", robots], ["sitemap", sitemap]]) {
  if (!content.includes("https://vayra.eybo.tech")) fail(`${name} lacks the canonical VAYRA URL`);
}

if (process.argv.includes("--published")) {
  const required = ["darwin-aarch64", "linux-x86_64", "windows-x86_64"];
  if (latest.version !== version) fail(`published manifest ${latest.version} differs from ${version}`);
  for (const platform of required) {
    const entry = latest.platforms?.[platform];
    if (!entry?.url || !entry?.signature) fail(`published manifest lacks ${platform}`);
    if (entry?.url && !entry.url.includes(`/releases/download/v${version}/`)) {
      fail(`${platform} does not target release v${version}`);
    }
  }
}

if (!process.exitCode) {
  console.log(`release check passed for VAYRA ${version}${process.argv.includes("--published") ? " (published)" : ""}`);
}
