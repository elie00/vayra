const STREMIO_PROTO = "stremio://";

export function normalizeInstallUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(STREMIO_PROTO)) {
    return "https://" + trimmed.slice(STREMIO_PROTO.length);
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return null;
}

function messageCandidate(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return null;
  const value = data as { url?: unknown; manifestUrl?: unknown };
  if (typeof value.url === "string") return value.url;
  return typeof value.manifestUrl === "string" ? value.manifestUrl : null;
}

/** Accept install messages only from the currently displayed configuration page. */
export function trustedInstallerMessage(
  event: Pick<MessageEvent, "data" | "origin" | "source">,
  iframeWindow: Window | null,
  iframeUrl: string,
): string | null {
  if (!iframeWindow || event.source !== iframeWindow) return null;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(iframeUrl).origin;
  } catch {
    return null;
  }
  if (event.origin !== expectedOrigin) return null;

  const normalized = normalizeInstallUrl(messageCandidate(event.data) ?? "");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.pathname.endsWith("/manifest.json") ? normalized : null;
  } catch {
    return null;
  }
}
