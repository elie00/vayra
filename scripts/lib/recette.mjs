// Replayable acceptance scenarios for scripts/recette.mjs: parsing and the
// checks behind `expect`, kept free of I/O so they can be tested.
//
// A scenario is a text file, one driver operation per line:
//
//   # Navigation par les onglets          ← the first comment is the title
//   @cible android                        ← the targets it runs on
//   launch
//   tap "Ma liste"
//   expect current "Ma liste"
//   @android swipe "Détails et plus" down 400   ← only on that target
//
// Blank lines and other # comments are ignored.

import { APP_OPS, HOST_OPS, splitOp } from "./agent-ops.mjs";

export const TARGETS = ["android", "desktop"];

const EXPECTATIONS = {
  visible: "expect visible <name> [ms]",
  gone: "expect gone <name> [ms]",
  current: "expect current <name>",
  dialog: "expect dialog <name>",
  nodialog: "expect nodialog",
  closed: "expect closed <dialog>",
  disabled: "expect disabled <name>",
  value: "expect value <field> <text>",
  noerrors: "expect noerrors",
};

export function parseScenario(text, file = "scenario") {
  let title = null;
  let targets = null;
  const steps = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const at = `${file}:${i + 1}`;
    if (!line) return;
    if (line.startsWith("#")) {
      title ??= line.replace(/^#+\s*/, "");
      return;
    }
    let words = splitOp(line);
    if (words[0] === "@cible") {
      targets = words.slice(1);
      const unknown = targets.filter((t) => !TARGETS.includes(t));
      if (targets.length === 0 || unknown.length) throw new Error(`${at}: @cible takes ${TARGETS.join(" and/or ")}`);
      return;
    }
    let only = null;
    if (words[0].startsWith("@")) {
      only = words[0].slice(1);
      if (!TARGETS.includes(only)) throw new Error(`${at}: unknown target @${only}; use @${TARGETS.join(" or @")}`);
      words = words.slice(1);
    }
    const [op, ...args] = words;
    if (op === "expect") {
      const [kind, ...rest] = args;
      if (!(kind in EXPECTATIONS)) throw new Error(`${at}: unknown expectation "${kind}"; use ${Object.keys(EXPECTATIONS).join(", ")}`);
      const needs = { visible: 1, gone: 1, current: 1, dialog: 1, closed: 1, disabled: 1, value: 2 }[kind] ?? 0;
      if (rest.length < needs) throw new Error(`${at}: usage: ${EXPECTATIONS[kind]}`);
      steps.push({ at, line, only, where: "expect", op: kind, args: rest });
      return;
    }
    const where = APP_OPS.has(op) ? "app" : HOST_OPS.has(op) ? "host" : null;
    if (!where) throw new Error(`${at}: unknown operation "${op}"`);
    steps.push({ at, line, only, where, op, args });
  });
  if (!targets) throw new Error(`${file}: missing "@cible android" or "@cible desktop"`);
  return { file, title: title ?? file, targets, steps };
}

const fold = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** True when one of `names` is `want`, case and accents aside. */
export function includesName(names, want) {
  return names.some((n) => fold(n) === fold(want));
}

/**
 * What an expectation asks the app for, and how to judge the reply.
 * Returns `{ op, args, check(value) → error message or null }`.
 */
export function expectationPlan(kind, args) {
  switch (kind) {
    case "visible":
      return { op: "wait", args: [args[0], args[1] ?? "8000"], check: () => null };
    case "gone":
      return { op: "gone", args: [args[0], args[1] ?? "8000"], check: () => null };
    case "current":
      return { op: "state", args: [], check: (s) => (includesName(s.current, args[0]) ? null : `current is [${s.current.join(", ")}], not "${args[0]}"`) };
    case "dialog":
      return { op: "state", args: [], check: (s) => (includesName(s.dialogs, args[0]) ? null : `open dialogs are [${s.dialogs.join(", ")}], not "${args[0]}"`) };
    case "nodialog":
      return { op: "state", args: [], check: (s) => (s.dialogs.length === 0 ? null : `dialogs still open: [${s.dialogs.join(", ")}]`) };
    case "closed":
      return { op: "state", args: [], check: (s) => (includesName(s.dialogs, args[0]) ? `"${args[0]}" is still open` : null) };
    case "disabled":
      return { op: "wait", args: [args[0], "8000"], check: (node) => (node.state?.disabled ? null : `"${node.name}" is enabled`) };
    case "value": {
      const want = args.slice(1).join(" ");
      return { op: "value", args: [args[0]], check: (node) => ((node.state?.value ?? "") === want ? null : `"${args[0]}" holds "${node.state?.value ?? ""}", not "${want}"`) };
    }
    case "noerrors":
      return { op: "logs", args: ["100"], check: (logs) => {
        const errors = logs.filter((l) => l.level === "error");
        return errors.length === 0 ? null : `${errors.length} error(s), last: ${errors[errors.length - 1].text}`;
      } };
  }
  throw new Error(`unknown expectation ${kind}`);
}
