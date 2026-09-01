// Per-host concurrency cap and circuit breaker for outbound requests.
//
// Without these, a single unreachable host is enough to melt the app: every
// caller fires its requests in parallel, each dead socket sits in SynSent until
// the 30s timeout, and the callers keep re-requesting. Measured on a network
// that blocks v3-cinemeta.strem.io, VAYRA held 2250 concurrent sockets to one
// address and burned ~170% CPU while completely idle.
//
// Local addresses are exempt: the stream proxy, the web UI server and the
// player talk to 127.0.0.1 and must never queue behind a remote host.

// Browsers settle around six connections per host; matching that keeps catalog
// rails fast while making a request storm structurally impossible.
const MAX_PER_HOST = 6;

// A host is tripped after this many consecutive connection failures.
const FAILURES_TO_TRIP = 5;

// Cooldown after tripping, doubling per further failure up to the ceiling.
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

export class HostUnreachableError extends Error {
  readonly host: string;
  readonly retryInMs: number;

  constructor(host: string, retryInMs: number) {
    super(`${host} is unreachable; retrying in ${Math.ceil(retryInMs / 1000)}s`);
    this.name = "HostUnreachableError";
    this.host = host;
    this.retryInMs = retryInMs;
  }
}

type HostState = {
  active: number;
  queue: Array<() => void>;
  failures: number;
  openUntil: number;
};

const hosts = new Map<string, HostState>();

function stateFor(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    s = { active: 0, queue: [], failures: 0, openUntil: 0 };
    hosts.set(host, s);
  }
  return s;
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    /^127\./.test(h)
  );
}

// Returns null when the URL needs no guarding (local, unparseable, non-http).
export function hostKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isLocalHost(parsed.hostname)) return null;
  return parsed.hostname;
}

// A connection-level failure — the host never answered. An HTTP error response
// means the host is alive and must not count toward tripping the breaker.
function isConnectionFailure(err: unknown): boolean {
  if (err instanceof HostUnreachableError) return false;
  return err instanceof Error;
}

function release(s: HostState): void {
  s.active--;
  const next = s.queue.shift();
  if (next) next();
}

function acquire(s: HostState): Promise<void> {
  if (s.active < MAX_PER_HOST) {
    s.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    s.queue.push(() => {
      s.active++;
      resolve();
    });
  });
}

function cooldownFor(failures: number): number {
  const over = Math.max(0, failures - FAILURES_TO_TRIP);
  return Math.min(BASE_COOLDOWN_MS * 2 ** over, MAX_COOLDOWN_MS);
}

// Runs `fn` under the host's concurrency cap and circuit breaker. While a host
// is tripped, this rejects immediately without opening a socket, which is what
// keeps an unreachable host from costing anything at all.
export async function withHostGuard<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = hostKey(url);
  if (host === null) return fn();

  const s = stateFor(host);
  const now = Date.now();
  if (s.openUntil > now) throw new HostUnreachableError(host, s.openUntil - now);

  await acquire(s);
  try {
    const out = await fn();
    s.failures = 0;
    s.openUntil = 0;
    return out;
  } catch (err) {
    if (isConnectionFailure(err)) {
      s.failures++;
      if (s.failures >= FAILURES_TO_TRIP) {
        s.openUntil = Date.now() + cooldownFor(s.failures);
      }
    }
    throw err;
  } finally {
    release(s);
  }
}

// The window.fetch captured before any patching. safeFetch and the guard itself
// MUST call this rather than the live global: if a guarded call re-entered the
// guard for the same host, six in-flight requests each waiting on their own
// inner request would hold every slot and deadlock the host permanently.
export const rawFetch: typeof fetch =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : (() => {
        throw new Error("fetch unavailable");
      }) as unknown as typeof fetch;

// Guards the global fetch as well. 51 call sites reach for window.fetch
// directly instead of safeFetch, so guarding only safeFetch would leave most of
// the app — and every third-party library — able to storm a host unchecked.
// `base` defaults to the pre-patch fetch and exists so tests can supply their
// own transport; production always wants the default.
export function installGlobalFetchGuard(base: typeof fetch = rawFetch): void {
  if (typeof globalThis.fetch !== "function") return;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    return withHostGuard(url, () => base(input, init));
  }) as typeof fetch;
}

// Test seam: drops all recorded state.
export function resetNetGuard(): void {
  hosts.clear();
}

// Exposed for diagnostics (settings/debug surfaces), not for control flow.
export function netGuardSnapshot(): Array<{ host: string; active: number; queued: number; trippedForMs: number }> {
  const now = Date.now();
  return [...hosts.entries()].map(([host, s]) => ({
    host,
    active: s.active,
    queued: s.queue.length,
    trippedForMs: Math.max(0, s.openUntil - now),
  }));
}
