import { CiraError } from "./errors";

export const CIRA_DISCOVER_ORIGIN = "https://vayra.eybo.tech";
export const CIRA_DISCOVER_PATH = "/cira/invite";

export type CiraDiscoverPayload = {
  code: string;
  canonicalUrl: string;
  source: "https" | "deep-link" | "code";
};

/** Mirrors private.cira_normalize_invite_code without accepting arbitrary URLs. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function requireValidInviteCode(code: string): string {
  if (code.length > 64) throw new CiraError("INVITATION_UNAVAILABLE");
  const normalized = normalizeInviteCode(code);
  if (!/^CIRA[0-9A-HJKMNP-TV-Z]{20}$/.test(normalized)) {
    throw new CiraError("INVITATION_UNAVAILABLE");
  }
  return normalized;
}

export function formatCiraInviteCode(code: string): string {
  const normalized = requireValidInviteCode(code);
  const secret = normalized.slice(4);
  return `CIRA-${secret.match(/.{4}/g)!.join("-")}`;
}

function strictFragmentCode(url: URL): string | null {
  if (url.search || !url.hash.startsWith("#")) return null;
  const entries = [...new URLSearchParams(url.hash.slice(1)).entries()];
  if (entries.length !== 1 || entries[0][0] !== "t") return null;
  return entries[0][1];
}

/** Parse only intentional CIRA inputs without opening or following a URL. */
export function parseCiraDiscoverPayload(raw: string): CiraDiscoverPayload | null {
  const value = raw.trim();
  if (!value || value.length > 256) return null;

  let rawCode: string | null = null;
  let source: CiraDiscoverPayload["source"] = "code";
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.origin === CIRA_DISCOVER_ORIGIN &&
      url.pathname === CIRA_DISCOVER_PATH &&
      !url.username &&
      !url.password
    ) {
      rawCode = strictFragmentCode(url);
      source = "https";
    } else if (
      url.protocol === "vayra:" &&
      url.hostname === "cira" &&
      url.pathname === "/invite"
    ) {
      rawCode = strictFragmentCode(url);
      source = "deep-link";
    } else {
      return null;
    }
  } catch {
    rawCode = value;
  }

  if (!rawCode) return null;
  try {
    const code = formatCiraInviteCode(rawCode);
    return {
      code,
      canonicalUrl: `${CIRA_DISCOVER_ORIGIN}${CIRA_DISCOVER_PATH}#t=${code}`,
      source,
    };
  } catch {
    return null;
  }
}
