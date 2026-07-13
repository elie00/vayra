import type { CiraErrorCode } from "./types";

// Codes stables levés par les RPC SQL (RAISE EXCEPTION 'CODE', errcode P0001):
// le MESSAGE PostgREST est alors exactement le code.
const SQL_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "PROFILE_REQUIRED",
  "INVALID_PROFILE",
  "HANDLE_UNAVAILABLE",
  "REQUEST_NOT_AVAILABLE",
  "ALREADY_RELATED",
  "INVALID_TRANSITION",
  "INVITATION_UNAVAILABLE",
  "RATE_LIMITED",
  "INVALID_GROUP",
  "GROUP_NOT_FOUND",
  "GROUP_FORBIDDEN",
  "GROUP_CAP_TOO_SMALL",
  "GROUP_FULL",
  "GROUP_MEMBER_NOT_FOUND",
  "INVALID_GROUP_ROLE",
  "GROUP_OWNER_MUST_TRANSFER",
  "GROUP_INVITE_UNAVAILABLE",
  "ALREADY_GROUP_MEMBER",
  "INVALID_GROUP_INVITE",
  "GROUP_BLOCK_CONFLICT",
  "INVALID_PAGE",
] as const;

// Le message de CiraError est TOUJOURS le code seul: aucune donnée d'origine
// (donc jamais de token/code d'invitation) ne peut s'y retrouver.
export class CiraError extends Error {
  readonly code: CiraErrorCode;

  constructor(code: CiraErrorCode) {
    super(code);
    this.name = "CiraError";
    this.code = code;
  }
}

function isSqlErrorCode(message: string): message is (typeof SQL_ERROR_CODES)[number] {
  return (SQL_ERROR_CODES as readonly string[]).includes(message);
}

// supabase-js encapsule les échecs fetch en `${name}: ${message}` (ex.
// "TypeError: Failed to fetch" / "TypeError: fetch failed" selon le runtime).
const NETWORK_MESSAGE = /fetch failed|failed to fetch|networkerror|network request failed|load failed/i;

export function toCiraError(error: unknown): CiraError {
  if (error instanceof CiraError) return error;
  if (error instanceof TypeError) return new CiraError("NETWORK");
  const message =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  if (isSqlErrorCode(message)) return new CiraError(message);
  if (NETWORK_MESSAGE.test(message)) return new CiraError("NETWORK");
  return new CiraError("UNKNOWN");
}
