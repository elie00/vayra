#!/usr/bin/env node
// Drives a running VAYRA built with VITE_VAYRA_AGENT=1, for an agent or a person.
//
// USAGE
//   node scripts/agent.mjs <android|desktop> "<operation>" ["<operation>" …]
//
//   In the app:  tree · tap <name|#i> · type <field> <text> · rect <name> · wait <name> [ms]
//                settle · state · logs [n] · key <Escape|Enter|…>
//   Host:        screenshot <file.png> · back · swipe <name> <down|up|left|right> [px] · launch · sleep <ms>
//
//   A name is a control's accessible name, case and accents aside, or a unique
//   part of it; an ambiguous name is refused with the candidates. `settle`
//   waits until no animation runs and the page stops changing, instead of a
//   guessed sleep. Each operation prints one JSON line; the first failure stops
//   the run with exit code 1.
//
//   node scripts/agent.mjs android launch "wait Accueil" "tap Rechercher" "type Rechercher dune" settle "screenshot /tmp/s.png"
//
// BUILD
//   VITE_VAYRA_AGENT=1 pnpm tauri android build --target aarch64   (or pnpm tauri dev for desktop)
//   The driver is compiled only into such builds. Port: VAYRA_AGENT_PORT (47800).

import { planOps } from "./lib/agent-ops.mjs";
import { openSession } from "./lib/agent-session.mjs";

const [target, ...texts] = process.argv.slice(2);
if (!["android", "desktop"].includes(target) || texts.length === 0) {
  console.error("usage: node scripts/agent.mjs <android|desktop> \"<operation>\" …  (see the header of this file)");
  process.exit(2);
}

let plan;
try {
  plan = planOps(texts);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

let code = 0;
let session;
try {
  session = await openSession({ target });
  for (const step of plan) {
    const value = await session.run(step);
    console.log(JSON.stringify({ op: [step.op, ...step.args].join(" "), ok: true, value }));
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  code = 1;
} finally {
  session?.close();
  process.exit(code);
}
