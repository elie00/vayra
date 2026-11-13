// Parsing and planning for scripts/agent.mjs, kept free of I/O so it can be tested.

/** Splits one operation string into words; quotes keep spaces: `tap "Dune: Part Two"`. */
export function splitOp(text) {
  const words = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text))) words.push(m[1] ?? m[2] ?? m[3]);
  return words;
}

/** Operations the app runs itself; the rest go through the host (adb, screencapture). */
export const APP_OPS = new Set(["tree", "tap", "type", "value", "rect", "wait", "gone", "settle", "state", "logs", "key", "reload"]);
export const HOST_OPS = new Set(["screenshot", "back", "swipe", "launch", "restart", "sleep"]);

export function planOps(texts) {
  return texts.map((text) => {
    const [op, ...args] = splitOp(text);
    if (!op) throw new Error("empty operation");
    if (APP_OPS.has(op)) return { where: "app", op, args };
    if (HOST_OPS.has(op)) return { where: "host", op, args };
    throw new Error(`unknown operation "${op}"; app: ${[...APP_OPS].join(", ")}; host: ${[...HOST_OPS].join(", ")}`);
  });
}

/**
 * The adb swipe for `swipe <name> <down|up|left|right> [px]`, from the element's
 * CSS rectangle and the device pixel ratio: from its centre, by `px` CSS pixels.
 */
export function swipeArgs(rect, dpr, direction, px = 300, ms = 250) {
  const cx = (rect.x + rect.w / 2) * dpr;
  const cy = (rect.y + rect.h / 2) * dpr;
  const d = px * dpr;
  const to = { down: [cx, cy + d], up: [cx, cy - d], left: [cx - d, cy], right: [cx + d, cy] }[direction];
  if (!to) throw new Error(`swipe direction must be down, up, left or right, not "${direction}"`);
  return [cx, cy, to[0], to[1]].map((n) => String(Math.round(n))).concat(String(ms));
}

/** A one-at-a-time queue between the script and the app's long poll. */
export function createQueue() {
  let nextId = 1;
  const waiting = []; // commands not yet fetched
  const pending = new Map(); // id -> resolve
  let poller = null; // a held /next request
  return {
    send(op, args) {
      const command = { id: nextId++, op, args };
      const result = new Promise((resolve) => pending.set(command.id, resolve));
      if (poller) {
        const take = poller;
        poller = null;
        take(command);
      } else waiting.push(command);
      return result;
    },
    /** For GET /next: a command now, or later; null after `holdMs`. */
    next(holdMs) {
      if (waiting.length > 0) return Promise.resolve(waiting.shift());
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (poller === take) poller = null;
          resolve(null);
        }, holdMs);
        const take = (command) => {
          clearTimeout(timer);
          resolve(command);
        };
        poller = take;
      });
    },
    /** For POST /result. */
    resolve(reply) {
      const done = pending.get(reply.id);
      if (!done) return false;
      pending.delete(reply.id);
      done(reply);
      return true;
    },
  };
}

/**
 * Which running app the script talks to. Each app start polls with its own id;
 * after a restart the stopped app's id is retired, so a poll it still had in
 * flight cannot pass for the new app and swallow the next command.
 */
export function createAppGate() {
  let current = null;
  const retired = new Set();
  return {
    get connected() {
      return current !== null;
    },
    /** "new" for the app now in use, "current" for it again, "retired" for a stopped one. */
    accept(id) {
      if (retired.has(id)) return "retired";
      if (id === current) return "current";
      current = id;
      return "new";
    },
    retire() {
      if (current !== null) retired.add(current);
      current = null;
    },
  };
}
