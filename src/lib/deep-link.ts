import { parseCiraDiscoverPayload } from "./cira/invite-code";

const EVENT = "vayra:deeplink-install";
const OPEN_EVENT = "vayra:deeplink-open";
const VAYRA_AUTH_EVENT = "vayra:deeplink-auth-callback";

type DeepLinkDetail = { rawUrl: string };
type DeepLinkOpen = { type: string; id: string; videoId?: string };
type DeepLinkOpenDetail = { open: DeepLinkOpen };

let pendingUrl: string | null = null;
let pendingVayraAuthUrl: string | null = null;

export function parseVayraAuthCallback(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "vayra:" || url.hostname !== "auth" || url.pathname !== "/callback") {
      return null;
    }
    return url.searchParams.has("code") || url.searchParams.has("error") ? rawUrl : null;
  } catch {
    return null;
  }
}

// The same callback can arrive through both the deep-link plugin and the native
// single-instance event; its code exchanges only once, so a repeat would fail.
const emittedVayraAuthUrls = new Set<string>();

export function emitVayraAuthCallback(rawUrl: string): void {
  if (emittedVayraAuthUrls.has(rawUrl)) return;
  emittedVayraAuthUrls.add(rawUrl);
  pendingVayraAuthUrl = rawUrl;
  window.dispatchEvent(
    new CustomEvent<{ rawUrl: string }>(VAYRA_AUTH_EVENT, { detail: { rawUrl } }),
  );
}

export function onVayraAuthCallback(handler: (rawUrl: string) => void): () => void {
  if (pendingVayraAuthUrl) {
    const rawUrl = pendingVayraAuthUrl;
    pendingVayraAuthUrl = null;
    handler(rawUrl);
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ rawUrl: string }>).detail;
    if (!detail?.rawUrl) return;
    pendingVayraAuthUrl = null;
    handler(detail.rawUrl);
  };
  window.addEventListener(VAYRA_AUTH_EVENT, listener);
  return () => window.removeEventListener(VAYRA_AUTH_EVENT, listener);
}

const CIRA_INVITE_EVENT = "vayra:deeplink-cira-invite";
let pendingCiraInviteCode: string | null = null;
const CIRA_GROUP_INVITE_EVENT = "vayra:deeplink-cira-group-invite";
let pendingCiraGroupInviteCode: string | null = null;
const VARA_INVITE_EVENT = "vayra:deeplink-vara-invite";
let pendingVaraInviteCode: string | null = null;

// vayra://cira/invite#t=<code> - même convention que la page web : le code
// reste dans le fragment, jamais dans une query string.
export function parseCiraInviteCode(rawUrl: string): string | null {
  const payload = parseCiraDiscoverPayload(rawUrl);
  return payload?.source === "deep-link" ? payload.code : null;
}

export function emitCiraInvite(code: string): void {
  pendingCiraInviteCode = code;
  window.dispatchEvent(
    new CustomEvent<{ code: string }>(CIRA_INVITE_EVENT, { detail: { code } }),
  );
}

export function onCiraInvite(handler: (code: string) => void): () => void {
  if (pendingCiraInviteCode) {
    const code = pendingCiraInviteCode;
    pendingCiraInviteCode = null;
    handler(code);
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ code: string }>).detail;
    if (!detail?.code) return;
    pendingCiraInviteCode = null;
    handler(detail.code);
  };
  window.addEventListener(CIRA_INVITE_EVENT, listener);
  return () => window.removeEventListener(CIRA_INVITE_EVENT, listener);
}

// vayra://cira/group#t=<code> keeps private-group links distinct from
// relationship invitations while preserving the fragment-only secret.
export function parseCiraGroupInviteCode(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "vayra:" || url.hostname !== "cira" || url.pathname !== "/group") {
      return null;
    }
    const match = /(?:^|[#&])t=([^&]+)/.exec(url.hash);
    if (!match) return null;
    const code = decodeURIComponent(match[1]).trim();
    return code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

export function emitCiraGroupInvite(code: string): void {
  pendingCiraGroupInviteCode = code;
  window.dispatchEvent(
    new CustomEvent<{ code: string }>(CIRA_GROUP_INVITE_EVENT, { detail: { code } }),
  );
}

export function onCiraGroupInvite(handler: (code: string) => void): () => void {
  if (pendingCiraGroupInviteCode) {
    const code = pendingCiraGroupInviteCode;
    pendingCiraGroupInviteCode = null;
    handler(code);
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ code: string }>).detail;
    if (!detail?.code) return;
    pendingCiraGroupInviteCode = null;
    handler(detail.code);
  };
  window.addEventListener(CIRA_GROUP_INVITE_EVENT, listener);
  return () => window.removeEventListener(CIRA_GROUP_INVITE_EVENT, listener);
}

// vayra://vara/invite#t=<code> carries only the opaque VARA link secret in
// the fragment. It is never accepted from a query string or a legacy scheme.
export function parseVaraInviteCode(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "vayra:" || url.hostname !== "vara" || url.pathname !== "/invite") {
      return null;
    }
    const match = /(?:^|[#&])t=([^&]+)/.exec(url.hash);
    if (!match) return null;
    const code = decodeURIComponent(match[1]).toUpperCase().replace(/[^0-9A-Z]/g, "");
    return /^VARA[0-9A-HJKMNP-TV-Z]{20}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function emitVaraInvite(code: string): void {
  pendingVaraInviteCode = code;
  window.dispatchEvent(
    new CustomEvent<{ code: string }>(VARA_INVITE_EVENT, { detail: { code } }),
  );
}

export function onVaraInvite(handler: (code: string) => void): () => void {
  if (pendingVaraInviteCode) {
    const code = pendingVaraInviteCode;
    pendingVaraInviteCode = null;
    handler(code);
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ code: string }>).detail;
    if (!detail?.code) return;
    pendingVaraInviteCode = null;
    handler(detail.code);
  };
  window.addEventListener(VARA_INVITE_EVENT, listener);
  return () => window.removeEventListener(VARA_INVITE_EVENT, listener);
}

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

const OPEN_FILE_EVENT = "vayra:open-local-file";

export function emitOpenLocalFile(path: string): void {
  window.dispatchEvent(new CustomEvent<{ path: string }>(OPEN_FILE_EVENT, { detail: { path } }));
}

export function onOpenLocalFile(handler: (path: string) => void): () => void {
  const listener = (e: Event) => {
    const ev = e as CustomEvent<{ path: string }>;
    if (ev.detail?.path) handler(ev.detail.path);
  };
  window.addEventListener(OPEN_FILE_EVENT, listener);
  return () => window.removeEventListener(OPEN_FILE_EVENT, listener);
}

// magnet: links and .torrent files opened from macOS. A website can fire a
// magnet link, so it opens the torrent card for the user to start playback.
const OPEN_MAGNET_EVENT = "vayra:open-magnet";
let pendingMagnet: string | null = null;

export function isMagnetLink(rawUrl: string): boolean {
  return /^magnet:\?/i.test(rawUrl);
}

/** A .torrent file opened from the Finder arrives as a file:// URL. */
export function parseTorrentFileUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "file:" || !/\.torrent$/i.test(url.pathname)) return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

export function emitOpenMagnet(magnet: string): void {
  pendingMagnet = magnet;
  window.dispatchEvent(new CustomEvent<{ magnet: string }>(OPEN_MAGNET_EVENT, { detail: { magnet } }));
}

export function onOpenMagnet(handler: (magnet: string) => void): () => void {
  if (pendingMagnet) {
    const magnet = pendingMagnet;
    pendingMagnet = null;
    handler(magnet);
  }
  const listener = (e: Event) => {
    const ev = e as CustomEvent<{ magnet: string }>;
    if (!ev.detail?.magnet) return;
    pendingMagnet = null;
    handler(ev.detail.magnet);
  };
  window.addEventListener(OPEN_MAGNET_EVENT, listener);
  return () => window.removeEventListener(OPEN_MAGNET_EVENT, listener);
}

async function openTorrentFile(path: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    emitOpenMagnet(await invoke<string>("torrent_file_magnet", { path }));
  } catch (e) {
    console.warn("[harbor] .torrent file could not be opened", e);
  }
}

// Jumelage : harbor://stremio-auth?key=<authKey> (QR affiché par le desktop,
// scanné par l'appareil photo du téléphone). Le lien peut arriver avant que
// l'AuthProvider soit monté (démarrage à froid) → clé mise en attente.
const AUTH_KEY_EVENT = "vayra:deeplink-stremio-auth";
let pendingAuthKey: string | null = null;

export function isAppScheme(u: string): boolean {
  return u.startsWith("harbor://") || u.startsWith("vayra://");
}

export function parseStremioAuthKey(url: string): string | null {
  const m = /^(?:harbor|vayra):\/\/stremio-auth\/?\?key=([^&]+)/.exec(url);
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
  if (isAppScheme(url)) return true;
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
        const vayraAuthUrl = parseVayraAuthCallback(u);
        if (vayraAuthUrl) {
          emitVayraAuthCallback(vayraAuthUrl);
          continue;
        }
        const ciraInvite = parseCiraInviteCode(u);
        if (ciraInvite) {
          emitCiraInvite(ciraInvite);
          continue;
        }
        const ciraGroupInvite = parseCiraGroupInviteCode(u);
        if (ciraGroupInvite) {
          emitCiraGroupInvite(ciraGroupInvite);
          continue;
        }
        const varaInvite = parseVaraInviteCode(u);
        if (varaInvite) {
          emitVaraInvite(varaInvite);
          continue;
        }
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
        if (isMagnetLink(u)) {
          emitOpenMagnet(u);
          continue;
        }
        const torrentFile = parseTorrentFileUrl(u);
        if (torrentFile) {
          void openTorrentFile(torrentFile);
          continue;
        }
        if (shouldForward(u)) emitDeepLinkInstall(u);
      }
    };
    const unlisten = await mod.onOpenUrl(handle);
    const { listen } = await import("@tauri-apps/api/event");
    const unlistenNative = await listen<string>("vayra:stremio-deeplink", (e) => {
      const u = e.payload;
      if (typeof u !== "string" || !u) return;
      const vayraAuthUrl = parseVayraAuthCallback(u);
      if (vayraAuthUrl) {
        emitVayraAuthCallback(vayraAuthUrl);
        return;
      }
      const ciraInvite = parseCiraInviteCode(u);
      if (ciraInvite) {
        emitCiraInvite(ciraInvite);
        return;
      }
      const ciraGroupInvite = parseCiraGroupInviteCode(u);
      if (ciraGroupInvite) {
        emitCiraGroupInvite(ciraGroupInvite);
        return;
      }
      const varaInvite = parseVaraInviteCode(u);
      if (varaInvite) {
        emitVaraInvite(varaInvite);
        return;
      }
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
      "vayra://browser-stremio-capture",
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
