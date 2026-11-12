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

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { createQueue, planOps, swipeArgs } from "./lib/agent-ops.mjs";

const [target, ...texts] = process.argv.slice(2);
if (!["android", "desktop"].includes(target) || texts.length === 0) {
  console.error("usage: node scripts/agent.mjs <android|desktop> \"<operation>\" …  (see the header of this file)");
  process.exit(2);
}
const port = Number(process.env.VAYRA_AGENT_PORT ?? 47800);
const adbPath = process.env.ADB ?? join(process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk"), "platform-tools/adb");
const adb = (...args) => execFileSync(adbPath, args, { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

let plan;
try {
  plan = planOps(texts);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const queue = createQueue();
let connected = false;
let onConnect = () => {};
// The app's page is another origin (tauri://localhost, http://tauri.localhost):
// without these headers the webview sends a poll but may not read the reply,
// and the command it carried is lost.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
};

const server = createServer((req, res) => {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET" && req.url?.startsWith("/next")) {
    if (!connected) {
      connected = true;
      onConnect();
    }
    queue.next(20_000).then((command) => {
      if (!command) return res.writeHead(204).end();
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(command));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        queue.resolve(JSON.parse(body));
      } catch { /* a malformed reply is dropped; the operation then times out */ }
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
});

async function inApp(op, args, timeoutMs = 30_000) {
  const reply = await Promise.race([
    queue.send(op, args),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: `no reply to ${op} in ${timeoutMs / 1000}s` }), timeoutMs)),
  ]);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

async function onHost(op, args) {
  switch (op) {
    case "sleep":
      await new Promise((r) => setTimeout(r, Number(args[0] ?? 500)));
      return { ms: Number(args[0] ?? 500) };
    case "launch":
      if (target !== "android") throw new Error("launch is for android; start the desktop app with pnpm tauri dev");
      adb("shell", "am", "force-stop", "app.vayra");
      adb("shell", "monkey", "-p", "app.vayra", "-c", "android.intent.category.LAUNCHER", "1");
      connected = false;
      return { launched: "app.vayra" };
    case "screenshot": {
      const file = args[0] ?? "agent-screenshot.png";
      if (target === "android") writeFileSync(file, adb("exec-out", "screencap", "-p"));
      else if (process.platform === "darwin") execFileSync("screencapture", ["-x", file]);
      else throw new Error("desktop screenshots are only wired for macOS");
      return { file };
    }
    case "back":
      if (target === "android") adb("shell", "input", "keyevent", "KEYCODE_BACK");
      else await inApp("key", ["Escape"]);
      return { back: true };
    case "swipe": {
      if (target !== "android") throw new Error("swipe is for android (adb input)");
      const [name, direction, px] = args;
      const rect = await inApp("rect", [name]);
      const { viewport } = await inApp("state", []);
      const a = swipeArgs(rect, viewport.dpr, direction, px ? Number(px) : undefined);
      adb("shell", "input", "swipe", ...a);
      return { swipe: name, direction, from: a.slice(0, 2), to: a.slice(2, 4) };
    }
  }
  throw new Error(`unknown host operation ${op}`);
}

function waitForApp(timeoutMs = 90_000) {
  if (connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the app did not connect on port ${port} in ${timeoutMs / 1000}s; is it a VITE_VAYRA_AGENT=1 build, and running?`)), timeoutMs);
    onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

server.listen(port, "127.0.0.1", async () => {
  let code = 0;
  try {
    if (target === "android") adb("reverse", `tcp:${port}`, `tcp:${port}`);
    for (const step of plan) {
      const value = step.where === "host" ? await onHost(step.op, step.args) : (await waitForApp(), await inApp(step.op, step.args));
      console.log(JSON.stringify({ op: [step.op, ...step.args].join(" "), ok: true, value }));
    }
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    code = 1;
  } finally {
    server.close();
    server.closeAllConnections?.();
    process.exit(code);
  }
});
