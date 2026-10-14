#!/usr/bin/env node
// Commits and pull requests in this repository are authored by the user alone:
// no line may credit an AI assistant (Co-Authored-By trailer, "Generated with" footer).
//
//   node scripts/attribution.mjs install                pnpm prepare: use the versioned hooks
//   node scripts/attribution.mjs strip <message-file>   commit-msg hook: drop those lines
//   node scripts/attribution.mjs check <base> <head>    CI: fail on commits that kept one,
//                                                       or on a PR body (PR_BODY) that has one
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LINE = /^.*(?:co-authored-by:.*(?:claude|anthropic)|generated with \[?claude).*$/gim;

export function hasAttribution(text) {
  return new RegExp(LINE.source, "im").test(text);
}

export function stripAttribution(text) {
  return text.replace(LINE, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function main([mode, ...args]) {
  if (mode === "install") {
    // Outside a git checkout (Flatpak, tarballs) there is no hook to install.
    spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
    return 0;
  }
  if (mode === "strip") {
    const [file] = args;
    const message = readFileSync(file, "utf8");
    if (hasAttribution(message)) writeFileSync(file, stripAttribution(message));
    return 0;
  }
  if (mode === "check") {
    const [base, head] = args;
    const log = execFileSync("git", ["log", "--format=%H%x00%B%x01", `${base}..${head}`], { encoding: "utf8" });
    const offenders = log
      .split("\x01")
      .map((entry) => entry.trim().split("\x00"))
      .filter(([hash, body]) => hash && hasAttribution(body ?? ""))
      .map(([hash]) => hash.slice(0, 8));
    if (offenders.length) console.error(`Commits crediting an AI assistant: ${offenders.join(", ")}`);
    const prBody = process.env.PR_BODY ?? "";
    if (hasAttribution(prBody)) console.error("The pull request description credits an AI assistant.");
    return offenders.length || hasAttribution(prBody) ? 1 : 0;
  }
  console.error("usage: attribution.mjs strip <file> | check <base> <head>");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
