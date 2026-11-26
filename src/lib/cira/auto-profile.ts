import { isPlaceholderName } from "@/lib/profiles";
import { CiraError } from "./errors";
import type { CiraProfile, CiraRepository } from "./types";

const HANDLE_RX = /^[a-z0-9][a-z0-9_]{2,23}$/;
const AVATAR_KEY_RX = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
// Strip HTML brackets and ASCII/C1 control characters to satisfy cira_profiles_display_name_clean.
const UNSAFE_NAME_CHARS_RX = /[<> \t\r\n\u0000-\u001F\u007F-\u009F]+/g;
const CONTROL_OR_BRACKET_RX = /[<> \u0000-\u001F\u007F-\u009F]/;

function cleanDisplayName(raw: string): string {
  const cleaned = raw
    .replace(UNSAFE_NAME_CHARS_RX, " ")
    .trim()
    .slice(0, 48)
    .trim();
  if (!cleaned) return "";
  // Final safety check against stray control/bracket chars
  return [...cleaned].filter((ch) => !CONTROL_OR_BRACKET_RX.test(ch) || ch === " ").join("").trim();
}

function titleCaseToken(token: string): string {
  if (!token) return "";
  return token[0].toUpperCase() + token.slice(1);
}

function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) return "";
  const words = localPart
    .replace(/[._+-]+/g, " ")
    .split(/\s+/)
    .map((w) => cleanDisplayName(w))
    .filter(Boolean)
    .map(titleCaseToken);
  return cleanDisplayName(words.join(" "));
}

/**
 * Derives a valid CIRA display name (1–48 chars, no `<`, `>`, or control chars)
 * from the user's local primary profile name (when non-placeholder) or email local-part.
 */
export function deriveDefaultDisplayName(
  localProfileName: string | null | undefined,
  email: string | null | undefined,
): string {
  if (localProfileName && !isPlaceholderName(localProfileName)) {
    const cleaned = cleanDisplayName(localProfileName);
    if (cleaned.length >= 1) return cleaned;
  }
  const fromEmail = displayNameFromEmail(email);
  if (fromEmail.length >= 1) return fromEmail;
  return "VAYRA";
}

function slugifyForHandle(raw: string): string {
  const ascii = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii;
}

function ensureValidHandle(candidate: string, fallback: string): string {
  const trimmed = candidate.replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
  if (HANDLE_RX.test(trimmed)) return trimmed;
  return fallback;
}

function extractUserHex(userId: string): string {
  const hex = userId.toLowerCase().replace(/[^a-f0-9]/g, "");
  return (hex || "00000000").padEnd(8, "0");
}

/**
 * Produces 3 deterministic, valid CIRA handle candidates matching
 * `^[a-z0-9][a-z0-9_]{2,23}$` for automatic provisioning without user prompts.
 */
export function deriveHandleCandidates(
  displayName: string,
  email: string | null | undefined,
  userId: string,
): [string, string, string] {
  const hex = extractUserHex(userId);
  const hex4 = hex.slice(0, 4);
  const hex8 = hex.slice(0, 8);
  const ultimateFallback = `vayra_${hex8}`;

  const nameSlug =
    displayName && displayName.toUpperCase() !== "VAYRA" && !isPlaceholderName(displayName)
      ? slugifyForHandle(displayName)
      : "";
  const emailSlug = email ? slugifyForHandle(email.split("@")[0] ?? "") : "";
  const rawBase = nameSlug || emailSlug || "vayra";

  const paddedBase =
    rawBase.length >= 3
      ? rawBase
      : `${rawBase}_${hex4}`.slice(0, 24);

  const first = ensureValidHandle(paddedBase, ultimateFallback);

  const shortBase = (rawBase.slice(0, 19).replace(/_+$/g, "") || "vayra");
  const secondRaw = `${shortBase}_${hex4}`;
  const second =
    secondRaw !== first
      ? ensureValidHandle(secondRaw, ultimateFallback)
      : ensureValidHandle(`${shortBase.slice(0, 15).replace(/_+$/g, "") || "vayra"}_${hex8}`, ultimateFallback);

  const third =
    ultimateFallback !== first && ultimateFallback !== second
      ? ultimateFallback
      : `v_${hex8}_${hex4}`;

  return [first, second, third];
}

/**
 * Returns `avatar` only when it satisfies `cira_profiles_avatar_key_format`
 * (`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`). Local `data:` URIs and URLs map to `null`.
 */
export function sanitizeCiraAvatarKey(avatar: string | null | undefined): string | null {
  if (typeof avatar !== "string") return null;
  const trimmed = avatar.trim();
  return AVATAR_KEY_RX.test(trimmed) ? trimmed : null;
}

export type AutoProvisionInput = {
  localProfileName?: string | null;
  email?: string | null;
  userId: string;
  avatar?: string | null;
};

/**
 * Automatically creates a `cira_profiles` row for a signed-in user by trying
 * up to 3 deterministic handle candidates on `HANDLE_UNAVAILABLE`.
 * Any non-collision error (rate-limit, network, auth) aborts immediately.
 */
export async function provisionCiraProfile(
  repo: Pick<CiraRepository, "saveProfile">,
  input: AutoProvisionInput,
): Promise<CiraProfile> {
  const displayName = deriveDefaultDisplayName(input.localProfileName, input.email);
  const candidates = deriveHandleCandidates(displayName, input.email, input.userId);
  const avatarKey = sanitizeCiraAvatarKey(input.avatar);

  let lastError: unknown = null;
  for (const handle of candidates) {
    try {
      return await repo.saveProfile({ handle, displayName, avatarKey });
    } catch (err) {
      if (err instanceof CiraError && err.code === "HANDLE_UNAVAILABLE") {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new CiraError("HANDLE_UNAVAILABLE");
}
