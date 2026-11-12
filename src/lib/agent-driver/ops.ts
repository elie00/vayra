import { agentTree, locate, reachable, TEXT_FIELDS } from "./a11y";

/**
 * The operations an agent can run inside the app. Each takes string arguments
 * and returns JSON; a refusal throws with a message that says what to do.
 */

const logs: { level: string; text: string; at: number }[] = [];
const MAX_LOGS = 100;

/** Keeps the last warnings and errors, for `logs`. */
export function captureLogs(target: Pick<Console, "warn" | "error"> = console, win: Window = window): void {
  for (const level of ["warn", "error"] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      push(level, args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : safeJson(a))).join(" "));
      original(...args);
    };
  }
  win.addEventListener("error", (e) => push("error", e.message));
  win.addEventListener("unhandledrejection", (e) => push("error", `unhandled: ${String((e as PromiseRejectionEvent).reason)}`));
}

function push(level: string, text: string) {
  logs.push({ level, text: text.slice(0, 500), at: Date.now() });
  if (logs.length > MAX_LOGS) logs.shift();
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Sets an input's value the way typing does, so React sees the change. */
function typeInto(el: Element, text: string) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error(`"${el.textContent}" is not a text field`);
  el.focus();
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Waits until nothing moves: no running animation or transition, and no DOM
 * change for `quietMs`. Replaces guessed sleeps; returns how long it took.
 */
export async function settle(quietMs = 250, timeoutMs = 8000, doc: Document = document): Promise<{ ms: number; settled: boolean }> {
  const start = performance.now();
  let last = performance.now();
  const observer = new MutationObserver(() => {
    last = performance.now();
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    for (;;) {
      const now = performance.now();
      const running = typeof doc.getAnimations === "function" && doc.getAnimations().some((a) => a.playState === "running" && isFinite(Number(a.effect?.getComputedTiming().endTime)));
      if (running) last = now;
      if (now - last >= quietMs) return { ms: Math.round(now - start), settled: true };
      if (now - start >= timeoutMs) return { ms: Math.round(now - start), settled: false };
      await sleep(50);
    }
  } finally {
    observer.disconnect();
  }
}

/** Waits for a control to appear, up to `timeoutMs`. */
async function waitFor(query: string, timeoutMs: number) {
  const start = performance.now();
  for (;;) {
    try {
      return locate(query).node;
    } catch (e) {
      if (performance.now() - start >= timeoutMs) throw e;
      await sleep(100);
    }
  }
}

function state(doc: Document = document) {
  // From the visible tree, so a hidden copy of a control is not counted.
  const tree = agentTree(doc);
  const focused = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  return {
    dialogs: tree.filter((n) => n.role === "dialog").map((n) => n.name),
    current: tree.filter((n) => n.state?.current).map((n) => n.name),
    expanded: tree.filter((n) => n.state?.expanded).map((n) => n.name),
    focused: focused ? focused.getAttribute("aria-label") || (focused as HTMLInputElement).placeholder || focused.tagName.toLowerCase() : null,
    os: doc.documentElement.dataset.os ?? null,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    lastErrors: logs.filter((l) => l.level === "error").slice(-3).map((l) => l.text),
  };
}

export async function run(op: string, args: string[]): Promise<unknown> {
  switch (op) {
    case "tree":
      return agentTree();
    case "tap": {
      const { node, element } = locate(need(args[0], "tap <name>"));
      if (node.state?.disabled) throw new Error(`#${node.index} "${node.name}" is disabled`);
      // As a person would: scroll it into view, then tap only if nothing covers it.
      element.scrollIntoView?.({ block: "center", inline: "center" });
      if (!reachable(element)) throw new Error(`#${node.index} "${node.name}" is covered by another element; close what is on top first`);
      (element as HTMLElement).click();
      return node;
    }
    case "type": {
      const { node, element } = locate(need(args[0], "type <field> <text>"), document, TEXT_FIELDS);
      typeInto(element, args.slice(1).join(" "));
      return node;
    }
    case "rect":
      return locate(need(args[0], "rect <name>")).node.rect;
    case "wait":
      return waitFor(need(args[0], "wait <name> [ms]"), Number(args[1] ?? 10000));
    case "settle":
      return settle();
    case "state":
      return state();
    case "logs":
      return logs.slice(-Number(args[0] ?? 30));
    case "key": {
      const key = need(args[0], "key <Escape|Enter|…>");
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return { key };
    }
    default:
      throw new Error(`unknown operation "${op}"; use tree, tap, type, rect, wait, settle, state, logs or key`);
  }
}

function need(v: string | undefined, usage: string): string {
  if (!v) throw new Error(`usage: ${usage}`);
  return v;
}
