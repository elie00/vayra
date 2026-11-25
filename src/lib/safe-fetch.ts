import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetchImpl } from "@tauri-apps/plugin-http";
import { TrackerBlockedError, isBlockedUrl, noteBlocked } from "./privacy/blocklist";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Torrentio + TorBox sit behind Cloudflare that blocks datacenter IPs, so on web they
// MUST be fetched directly from the browser's residential IP (they set CORS, so it
// works) — proxying them through the VPS gets 403'd. EVERYTHING ELSE routes through the
// VPS /api-proxy: it's required for addons that send no CORS header at all (OpenSubtitles)
// and for the CORS-less debrid REST APIs, and it's fine for the rest (Cinemeta, Comet).
const DIRECT_HOSTS = new Set([
  "torrentio.strem.fun",
  "stremio.torbox.app",
  "87d6a6ef6b58-webstreamrmbg.baby-beamup.club",
]);

const PROXY_HOSTS = new Set([
  "v3-cinemeta.strem.io",
  "opensubtitles-v3.strem.io",
  "opensubtitles.strem.io",
  "opensubtitles.stremio.homes",
  "api.torbox.app",
  "api.real-debrid.com",
  "api.alldebrid.com",
  "debrid-link.com",
  "www.premiumize.me",
]);

const PROXY_SUFFIXES = [
  ".elfhosted.com",
  ".strem.fun",
  ".strem.io",
  ".stremio.homes",
  ".baby-beamup.club",
  ".workers.dev",
  ".debridio.com",
  ".code.run",
  ".fly.dev",
  ".onrender.com",
  ".vercel.app",
  ".netlify.app",
  ".railway.app",
  ".deno.dev",
];

function rewriteForWeb(url: string, init?: RequestInit): { url: string; init?: RequestInit } {
  if (isTauri) return { url, init };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, init };
  }
  if (DIRECT_HOSTS.has(parsed.hostname)) return { url, init };
  const proxiable =
    PROXY_HOSTS.has(parsed.hostname) || PROXY_SUFFIXES.some((s) => parsed.hostname.endsWith(s));
  if (!proxiable) return { url, init };

  const proxied = `/api-proxy?u=${encodeURIComponent(parsed.href)}`;
  if (!init?.headers) return { url: proxied, init };
  const out = new Headers(init.headers as HeadersInit);
  const auth = out.get("authorization");
  if (auth) {
    out.delete("authorization");
    out.set("x-harbor-auth", auth);
  }
  return { url: proxied, init: { ...init, headers: out } };
}

type HarborFetchResponse = {
  status: number;
  ok: boolean;
  body: string;
  contentType: string | null;
  contentLength?: string | null;
};

let nextFetchRequestId = 1;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function raceWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
  onAbort?: () => void,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      onAbort?.();
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", handleAbort);
        reject(err);
      },
    );
  });
}

async function tauriHarborFetch(input: string, init?: RequestInit): Promise<Response> {
  if (init?.signal?.aborted) throw abortError();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers as HeadersInit);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? JSON.stringify(init.body)
          : undefined;
  const requestId = init?.signal ? nextFetchRequestId++ : undefined;
  const resp = await raceWithSignal(
    invoke<HarborFetchResponse>("vayra_fetch", {
      args: {
        url: input,
        method: init?.method ?? "GET",
        headers,
        body,
        timeoutMs: 15000,
        requestId,
      },
    }),
    init?.signal,
    requestId !== undefined
      ? () => {
          invoke("vayra_fetch_cancel", { requestId }).catch(() => {
            /* best-effort cancellation of native inflight socket */
          });
        }
      : undefined,
  );
  const resHeaders: Record<string, string> = {};
  if (resp.contentType) resHeaders["content-type"] = resp.contentType;
  if (resp.contentLength) resHeaders["content-length"] = resp.contentLength;
  return new Response(resp.body, {
    status: resp.status,
    headers: resHeaders,
  });
}

function isIdempotent(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

export const safeFetch: typeof fetch = (input, init) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  if (target && isBlockedUrl(target)) {
    noteBlocked();
    let host = target;
    try {
      host = new URL(target).hostname;
    } catch {
      /* invalid URL string; preserve raw target as host label */
    }
    return Promise.reject(new TrackerBlockedError(host));
  }
  if (isTauri) {
    if (target) {
      if (isIdempotent(init?.method)) {
        return tauriHarborFetch(target, init).catch((err) => {
          if (isAbortError(err) || init?.signal?.aborted) throw err;
          return tauriFetchImpl(target, init as RequestInit) as Promise<Response>;
        });
      }
      return tauriHarborFetch(target, init);
    }
    return tauriFetchImpl(input as unknown as string, init as RequestInit) as Promise<Response>;
  }
  if (target) {
    const r = rewriteForWeb(target, init);
    return fetch(r.url, r.init);
  }
  return fetch(input, init);
};
