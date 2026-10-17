/**
 * The web view has no stderr: its warnings and errors never reached vayra.log, so
 * failures the interface caught (network, JustWatch, downloads) left no trace in
 * the installed app. Forward them, one line each, bounded so a loop cannot flood it.
 */

const MAX_PER_MINUTE = 30;
const MAX_LENGTH = 2000;

function formatOne(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === undefined || value === null || typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatLogArgs(args: unknown[]): string {
  return args.map(formatOne).join(" ").replace(/\s*\n\s*/g, " ⏎ ").slice(0, MAX_LENGTH);
}

type Level = "warn" | "error";

export function forwardConsoleToLog(send: (level: Level, message: string) => void, now: () => number = Date.now): void {
  let windowStart = now();
  let sentInWindow = 0;
  let dropped = 0;
  const forward = (level: Level, args: unknown[]) => {
    const at = now();
    if (at - windowStart >= 60_000) {
      if (dropped > 0) send("warn", `${dropped} console lines dropped in the last minute`);
      windowStart = at;
      sentInWindow = 0;
      dropped = 0;
    }
    if (sentInWindow >= MAX_PER_MINUTE) {
      dropped += 1;
      return;
    }
    sentInWindow += 1;
    send(level, formatLogArgs(args));
  };
  for (const level of ["warn", "error"] as const) {
    const print = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      print(...args);
      forward(level, args);
    };
  }
}
