import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");

const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function lineOf(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return 1;
  return text.slice(0, match.index).split("\n").length;
}

const failures = [];
const checks = [];

function check(name, condition, relativePath, pattern, message) {
  checks.push(name);
  if (condition) return;
  const text = read(relativePath);
  failures.push(`${relativePath}:${lineOf(text, pattern)} - ${message}`);
}

const indexHtml = read("index.html");
const indexCss = read("src/index.css");
const accessibilityNavigation = read("src/components/accessibility-navigation.tsx");
const authModal = read("src/components/auth-modal.tsx");

check(
  "browser zoom remains available",
  !/(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1)/i.test(indexHtml),
  "index.html",
  /<meta\s+name="viewport"/,
  "viewport must not disable browser zoom",
);
check(
  "native dark surface metadata",
  /<meta\s+name="theme-color"\s+content="#0a0b0d"/.test(indexHtml),
  "index.html",
  /<head>/,
  "missing theme-color matching the VAYRA canvas",
);
check(
  "boot motion follows user preference",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#harbor-boot svg\s*\{\s*animation:\s*none/.test(indexHtml),
  "index.html",
  /#harbor-boot svg/,
  "boot animation needs a reduced-motion variant",
);
check(
  "global focus covers form controls",
  /input:focus-visible/.test(indexCss) && /textarea:focus-visible/.test(indexCss),
  "src/index.css",
  /button:focus-visible/,
  "input and textarea need a visible focus treatment",
);
check(
  "global reduced-motion fallback",
  /prefers-reduced-motion:\s*reduce[\s\S]*?animation-duration:\s*0\.01ms\s*!important[\s\S]*?transition-duration:\s*0\.01ms\s*!important/.test(indexCss),
  "src/index.css",
  /prefers-reduced-motion:\s*reduce/,
  "animations and transitions need a global reduced-motion fallback",
);
check(
  "keyboard navigation announcement",
  /href="#vayra-current-content"/.test(accessibilityNavigation) && /aria-live="polite"/.test(accessibilityNavigation),
  "src/components/accessibility-navigation.tsx",
  /export function/,
  "skip navigation and polite route announcements are required",
);
check(
  "authentication form semantics",
  /name="vayra-email"/.test(authModal) &&
    /name="vayra-otp"/.test(authModal) &&
    /autoComplete="one-time-code"/.test(authModal) &&
    /aria-live="polite"/.test(authModal) &&
    /overscroll-contain/.test(authModal),
  "src/components/auth-modal.tsx",
  /function VayraEmailModal/,
  "auth fields need names, autocomplete, inline async feedback, and contained modal scroll",
);

const debt = {
  nonSemanticClick: [],
  autoFocus: [],
  transitionAll: [],
};

for (const absolute of sourceFiles(sourceRoot)) {
  const relative = path.relative(projectRoot, absolute);
  const text = fs.readFileSync(absolute, "utf8");

  for (const match of text.matchAll(/(?:transition-all|transition\s*:\s*all\b)/g)) {
    debt.transitionAll.push(`${relative}:${text.slice(0, match.index).split("\n").length}`);
  }

  if (!absolute.endsWith(".tsx")) continue;
  const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const names = new Set(attributes.map((attribute) => attribute.name.getText(source)));
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if ((tag === "div" || tag === "span") && names.has("onClick")) {
        debt.nonSemanticClick.push(`${relative}:${line}`);
      }
      if (names.has("autoFocus")) debt.autoFocus.push(`${relative}:${line}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const debtBudgets = {
  nonSemanticClick: 123,
  autoFocus: 36,
  transitionAll: 168,
};

for (const [key, budget] of Object.entries(debtBudgets)) {
  const entries = debt[key];
  checks.push(`progressive ${key} budget`);
  if (entries.length > budget) {
    failures.push(`${entries[budget] ?? "src:1"} - ${key} debt increased (${entries.length} > ${budget})`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Design checklist: ${checks.length}/${checks.length} controls passed.`);
console.log(
  `Progressive debt: ${debt.nonSemanticClick.length} non-semantic click targets, ${debt.autoFocus.length} autofocus uses, ${debt.transitionAll.length} transition-all uses.`,
);
