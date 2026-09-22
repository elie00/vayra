import { safeFetch } from "./safe-fetch";
export type AddonDiagnostic = "reachable" | "configuration" | "access" | "unavailable" | "invalid";

/** Only fetch the installed manifest. Never echo URL, response body or secrets. */
export async function diagnoseAddon(url: string, signal?: AbortSignal): Promise<AddonDiagnostic> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) return "invalid";
    return await Promise.race([
      (async (): Promise<AddonDiagnostic> => {
        const response = await safeFetch(url, { signal: controller.signal, headers: { Accept: "application/json" }, redirect: "error" });
        if (response.status === 401 || response.status === 403) return "access";
        if (!response.ok) return "unavailable";
        const body = await response.text();
        if (body.length > 2_000_000) return "invalid";
        const manifest = JSON.parse(body);
        if (!manifest || typeof manifest.id !== "string" || typeof manifest.name !== "string") return "invalid";
        return manifest.behaviorHints?.configurationRequired === true ? "configuration" : "reachable";
      })(),
      new Promise<AddonDiagnostic>((resolve) => { timer = setTimeout(() => { cancel(); resolve("unavailable"); }, 8000); }),
    ]);
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
