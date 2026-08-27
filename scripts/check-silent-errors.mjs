#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

// Historical debt is intentionally ratcheted: existing best-effort calls can be
// reviewed incrementally, but a change may not increase the number of promises
// whose rejection is discarded without logging, feedback or a comment.
const MAX_EMPTY_PROMISE_CATCHES = 271;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const EMPTY_PROMISE_CATCH = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

let count = 0;
for (const file of sourceFiles("src")) {
  count += [...readFileSync(file, "utf8").matchAll(EMPTY_PROMISE_CATCH)].length;
}

if (count > MAX_EMPTY_PROMISE_CATCHES) {
  console.error(
    `silent-error check failed: ${count} empty promise catches exceed the ${MAX_EMPTY_PROMISE_CATCHES} baseline`,
  );
  console.error("Handle the rejection, surface feedback, or document an intentional best-effort failure.");
  process.exit(1);
}

console.log(`silent-error check passed: ${count}/${MAX_EMPTY_PROMISE_CATCHES} empty promise catches`);
