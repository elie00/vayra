/** Optional diagnostics for callers that must distinguish an empty response from failure. */
export type RequestDiagnostics = { failed: boolean };

export const SEARCH_TIMEOUT_MS = 15_000;
export const HOME_CATALOG_TIMEOUT_MS = 20_000;

/** Bound UI waiting even when a native transport cannot be cancelled. Late work is ignored. */
export function withRequestTimeout<T>(request: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const finish = (error: Error | null, value?: T) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const onAbort = () => finish(new Error("Request cancelled"));
    const timer = setTimeout(() => finish(new Error("Request timed out")), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    request.then((value) => finish(null, value), () => finish(new Error("Source unavailable")));
  });
}
