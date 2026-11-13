// One driver session: the loopback server the app polls, and the operations,
// run in the app or on the host. Shared by scripts/agent.mjs and scripts/recette.mjs.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAppGate, createQueue, swipeArgs } from "./agent-ops.mjs";

// The app's page is another origin (tauri://localhost, http://tauri.localhost):
// without these headers the webview sends a poll but may not read the reply,
// and the command it carried is lost.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
};

/** Opens the server; resolves once it listens. `target` is "android" or "desktop". */
export function openSession({ target, port = Number(process.env.VAYRA_AGENT_PORT ?? 47800) }) {
  const adbPath = process.env.ADB ?? join(process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk"), "platform-tools/adb");
  const adb = (...args) => execFileSync(adbPath, args, { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const queue = createQueue();
  const gate = createAppGate();
  let onConnect = () => {};

  const server = createServer((req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (req.method === "GET" && req.url?.startsWith("/next")) {
      const app = new URL(req.url, "http://x").searchParams.get("app") ?? "unnamed";
      const seen = gate.accept(app);
      if (seen === "retired") return res.writeHead(204).end();
      if (seen === "new") onConnect();
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

  function waitForApp(timeoutMs = 90_000) {
    if (gate.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`the app did not connect on port ${port} in ${timeoutMs / 1000}s; is it a VITE_VAYRA_AGENT=1 build, and running?`)), timeoutMs);
      onConnect = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async function inApp(op, args, timeoutMs = 30_000) {
    await waitForApp();
    const reply = await Promise.race([
      queue.send(op, args),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: `no reply to ${op} in ${timeoutMs / 1000}s` }), timeoutMs)),
    ]);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }

  function screenshot(file) {
    if (target === "android") writeFileSync(file, adb("exec-out", "screencap", "-p"));
    else if (process.platform === "darwin") execFileSync("screencapture", ["-x", file]);
    else throw new Error("desktop screenshots are only wired for macOS");
    return { file };
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
        gate.retire();
        return { launched: "app.vayra" };
      case "restart":
        // A clean start on either target: relaunch on Android, reload the page on the desktop.
        if (target === "android") return onHost("launch", []);
        await inApp("reload", []);
        gate.retire();
        return { reloaded: true };
      case "screenshot":
        return screenshot(args[0] ?? "agent-screenshot.png");
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

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      try {
        if (target === "android") adb("reverse", `tcp:${port}`, `tcp:${port}`);
      } catch (e) {
        server.close();
        return reject(new Error(`adb reverse failed: ${e.message}`));
      }
      resolve({
        target,
        /** Runs one planned step: `{ where: "app" | "host", op, args }`. */
        run: (step) => (step.where === "host" ? onHost(step.op, step.args) : inApp(step.op, step.args)),
        inApp,
        screenshot,
        close() {
          server.close();
          server.closeAllConnections?.();
        },
      });
    });
  });
}
