const EVENT = "harbor:deeplink-install";
const OPEN_EVENT = "harbor:deeplink-open";

type DeepLinkDetail = { rawUrl: string };
type DeepLinkOpen = { type: string; id: string; videoId?: string };
type DeepLinkOpenDetail = { open: DeepLinkOpen };

let pendingUrl: string | null = null;

export function emitDeepLinkInstall(rawUrl: string): void {
  pendingUrl = rawUrl;
  window.dispatchEvent(new CustomEvent<DeepLinkDetail>(EVENT, { detail: { rawUrl } }));
}

export function consumePendingDeepLink(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}

export function peekPendingDeepLink(): string | null {
  return pendingUrl;
}

export function clearPendingDeepLink(): void {
  pendingUrl = null;
}

export function onDeepLinkInstall(handler: (rawUrl: string) => void): () => void {
  const listener = (e: Event) => {
    const ev = e as CustomEvent<DeepLinkDetail>;
    if (ev.detail?.rawUrl) handler(ev.detail.rawUrl);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function emitDeepLinkOpen(open: DeepLinkOpen): void {
  window.dispatchEvent(new CustomEvent<DeepLinkOpenDetail>(OPEN_EVENT, { detail: { open } }));
}

export function onDeepLinkOpen(handler: (open: DeepLinkOpen) => void): () => void {
  const listener = (e: Event) => {
    const ev = e as CustomEvent<DeepLinkOpenDetail>;
    if (ev.detail?.open) handler(ev.detail.open);
  };
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

// Jumelage : harbor://stremio-auth?key=<authKey> (QR affiché par le desktop,
// scanné par l'appareil photo du téléphone). Le lien peut arriver avant que
// l'AuthProvider soit monté (démarrage à froid) → clé mise en attente.
const AUTH_KEY_EVENT = "harbor:deeplink-stremio-auth";
let pendingAuthKey: string | null = null;

export function parseStremioAuthKey(url: string): string | null {
  const m = /^harbor:\/\/stremio-auth\/?\?key=([^&]+)/.exec(url);
  if (!m) return null;
  try {
    const key = decodeURIComponent(m[1]).trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

export function emitStremioAuthKey(key: string): void {
  pendingAuthKey = key;
  window.dispatchEvent(new CustomEvent<{ key: string }>(AUTH_KEY_EVENT, { detail: { key } }));
}

export function onStremioAuthKey(handler: (key: string) => void): () => void {
  if (pendingAuthKey) {
    const key = pendingAuthKey;
    pendingAuthKey = null;
    handler(key);
  }
  const listener = (e: Event) => {
    const ev = e as CustomEvent<{ key: string }>;
    if (ev.detail?.key) {
      pendingAuthKey = null;
      handler(ev.detail.key);
    }
  };
  window.addEventListener(AUTH_KEY_EVENT, listener);
  return () => window.removeEventListener(AUTH_KEY_EVENT, listener);
}

function parseDetailPath(path: string): DeepLinkOpen | null {
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts[0] !== "detail" || parts.length < 3) return null;
  const type = decodeURIComponent(parts[1]);
  const id = decodeURIComponent(parts[2]);
  if (!type || !id) return null;
  const videoId = parts[3] ? decodeURIComponent(parts[3]) : undefined;
  return { type, id, videoId };
}

export function parseStremioOpen(url: string): DeepLinkOpen | null {
  if (url.startsWith("stremio://")) return parseDetailPath(url.slice("stremio://".length));
  const hash = url.indexOf("#");
  if (hash !== -1 && url.includes("stremio.com")) {
    let frag = url.slice(hash + 1);
    if (frag.startsWith("/")) frag = frag.slice(1);
    return parseDetailPath(frag);
  }
  return null;
}

function shouldForward(url: string): boolean {
  if (url.startsWith("harbor://")) return true;
  if (url.startsWith("stremio://")) {
    if (window.__harborInstallerOpen) return true;
    return !!window.__harborStremioDeeplink;
  }
  return url.includes("manifest.json");
}

export async function startDeepLinkBridge(): Promise<() => void> {
  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
  if (!isTauri) return () => {};
  try {
    const mod = await import("@tauri-apps/plugin-deep-link");
    const handle = (urls: string[]) => {
      for (const u of urls) {
        if (typeof u !== "string" || u.length === 0) continue;
        const authKey = parseStremioAuthKey(u);
        if (authKey) {
          emitStremioAuthKey(authKey);
          continue;
        }
        const open = parseStremioOpen(u);
        if (open) {
          emitDeepLinkOpen(open);
          continue;
        }
        if (shouldForward(u)) emitDeepLinkInstall(u);
      }
    };
    const unlisten = await mod.onOpenUrl(handle);
    const { listen } = await import("@tauri-apps/api/event");
    const unlistenNative = await listen<string>("harbor:stremio-deeplink", (e) => {
      const u = e.payload;
      if (typeof u !== "string" || !u) return;
      const open = parseStremioOpen(u);
      if (open) {
        emitDeepLinkOpen(open);
        return;
      }
      if (shouldForward(u)) emitDeepLinkInstall(u);
    });
    let lastCap = "";
    let lastCapAt = 0;
    const forwardLinuxBrowserInstall = async (e: { payload: string }) => {
      const u = e.payload;
      if (typeof u !== "string" || !u) return;
      const open = parseStremioOpen(u);
      if (open) {
        emitDeepLinkOpen(open);
        return;
      }
      const now = Date.now();
      if (u === lastCap && now - lastCapAt < 2500) return;
      lastCap = u;
      lastCapAt = now;
      emitDeepLinkInstall(u);
      const { invoke } = await import("@tauri-apps/api/core");
      invoke("browser_close").catch(() => {});
    };
    const unlistenBrowserCap = await listen<string>(
      "harbor://browser-stremio-capture",
      forwardLinuxBrowserInstall,
    );
    try {
      const initial = await mod.getCurrent();
      if (initial && initial.length > 0) handle(initial);
    } catch {}
    return () => {
      try {
        unlisten();
      } catch {}
      try {
        unlistenNative();
      } catch {}
      try {
        unlistenBrowserCap();
      } catch {}
    };
  } catch (e) {
    console.warn("[harbor] deep-link bridge failed", e);
    return () => {};
  }
}
