import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** Literal translation calls in app code, including keys absent from the English catalog. */
export function collectTranslationKeys(directory) {
  const keys = new Set();
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "i18n") scan(path);
        continue;
      }
      if (!/\.tsx?$/.test(path) || /\.(test|spec)\./.test(path)) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
          const key = node.arguments[0];
          if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))) keys.add(key.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(directory);
  return [...keys].sort();
}

/** Static labels passed through t(label), for data-driven settings navigation. */
export function collectDisplayKeys(files) {
  const keys = new Set();
  for (const path of files) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function collect(value) {
      if (ts.isStringLiteral(value)) keys.add(value.text);
      else if (ts.isConditionalExpression(value)) {
        collect(value.whenTrue);
        collect(value.whenFalse);
      }
    }
    function visit(node) {
      if (ts.isPropertyAssignment(node) && ["label", "sub", "heading"].includes(node.name.getText(source))) collect(node.initializer);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...keys];
}
