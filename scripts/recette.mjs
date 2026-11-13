#!/usr/bin/env node
// Replays the acceptance scenarios in recette/ against a drivable VAYRA
// (a VITE_VAYRA_AGENT=1 build), and reports each one.
//
// USAGE
//   node scripts/recette.mjs <android|desktop> [scenario files or folders…]   (default: recette/)
//
//   Runs the scenarios whose "@cible" names the target, one after the other, in
//   one driver session. A failed step stops its scenario, saves a screenshot to
//   VAYRA_RECETTE_OUT (/tmp/vayra-recette) and moves on to the next one. Exit
//   code 1 when any scenario failed. The format is described in scripts/lib/recette.mjs
//   and docs/agent-driver.md.

import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { openSession } from "./lib/agent-session.mjs";
import { expectationPlan, parseScenario, TARGETS } from "./lib/recette.mjs";

const [target, ...paths] = process.argv.slice(2);
if (!TARGETS.includes(target)) {
  console.error(`usage: node scripts/recette.mjs <${TARGETS.join("|")}> [scenario files or folders…]`);
  process.exit(2);
}
const outDir = process.env.VAYRA_RECETTE_OUT ?? "/tmp/vayra-recette";
mkdirSync(outDir, { recursive: true });

function collect(path) {
  if (statSync(path).isDirectory()) return readdirSync(path).sort().flatMap((f) => collect(join(path, f)));
  return path.endsWith(".recette") ? [path] : [];
}

let scenarios;
try {
  scenarios = (paths.length ? paths : ["recette"]).flatMap(collect).map((f) => parseScenario(readFileSync(f, "utf8"), f));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const mine = scenarios.filter((s) => s.targets.includes(target));
if (mine.length === 0) {
  console.error(`no scenario for ${target}`);
  process.exit(2);
}

const session = await openSession({ target }).catch((e) => {
  console.error(e.message);
  process.exit(2);
});

const results = [];
for (const scenario of mine) {
  const started = Date.now();
  let failure = null;
  for (const step of scenario.steps) {
    if (step.only && step.only !== target) continue;
    try {
      if (step.where === "expect") {
        const plan = expectationPlan(step.op, step.args);
        const problem = plan.check(await session.inApp(plan.op, plan.args));
        if (problem) throw new Error(problem);
      } else {
        await session.run(step);
      }
    } catch (e) {
      const shot = join(outDir, `${basename(scenario.file, ".recette")}-echec.png`);
      try {
        session.screenshot(shot);
      } catch { /* no screenshot on this host */ }
      failure = { at: step.at, line: step.line, error: e.message, screenshot: shot };
      break;
    }
  }
  const ms = Date.now() - started;
  results.push({ scenario, failure, ms });
  if (failure) {
    console.log(`✗ ${scenario.title}  (${(ms / 1000).toFixed(1)} s)`);
    console.log(`    ${failure.at}  ${failure.line}`);
    console.log(`    ${failure.error}`);
    console.log(`    capture : ${failure.screenshot}`);
  } else {
    console.log(`✓ ${scenario.title}  (${(ms / 1000).toFixed(1)} s)`);
  }
}

session.close();
const failed = results.filter((r) => r.failure).length;
console.log(`\n${results.length - failed}/${results.length} scénarios réussis sur ${target}`);
process.exit(failed ? 1 : 0);
