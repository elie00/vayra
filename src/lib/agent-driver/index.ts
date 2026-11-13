import { captureLogs, run, trackTimers } from "./ops";

/**
 * The in-app half of the agent driver, compiled only into builds made with
 * VITE_VAYRA_AGENT=1. It long-polls the driver script on the loopback
 * (`scripts/agent.mjs`), runs each operation and posts the result back. On
 * Android the script maps the port with `adb reverse`.
 */
export function startAgentDriver(port = Number(import.meta.env.VITE_VAYRA_AGENT_PORT ?? 47800)): void {
  const base = `http://127.0.0.1:${port}`;
  // This start's own id: after a restart the script tells the new app from
  // a poll the stopped one still had in flight.
  const app = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  captureLogs();
  trackTimers();
  console.info(`[agent] driver waiting on ${base}`);
  void (async () => {
    for (;;) {
      let command: { id: number; op: string; args: string[] } | null = null;
      try {
        const res = await fetch(`${base}/next?app=${encodeURIComponent(app)}`, { cache: "no-store" });
        if (res.status === 200) command = await res.json();
      } catch {
        // No driver running: try again shortly.
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!command) continue;
      let reply: { id: number; ok: boolean; value?: unknown; error?: string };
      try {
        reply = { id: command.id, ok: true, value: await run(command.op, command.args) };
      } catch (e) {
        reply = { id: command.id, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      await fetch(`${base}/result`, { method: "POST", body: JSON.stringify(reply) }).catch(() => { /* The script went away; the next poll waits for it. */ });
    }
  })();
}
