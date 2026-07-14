import type { VaraErrorCode } from "./types";

const SQL_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "BETA_ACCESS_REQUIRED",
  "PROFILE_REQUIRED",
  "INVALID_VARA_ROOM",
  "VARA_ROOM_UNAVAILABLE",
  "VARA_ROOM_FORBIDDEN",
  "VARA_NOT_HOST",
  "VARA_HOST_LEASE_ACTIVE",
  "VARA_HOST_TRANSFER_UNAVAILABLE",
  "VARA_INVITE_UNAVAILABLE",
  "ALREADY_VARA_MEMBER",
  "VARA_ROOM_FULL",
  "INVALID_VARA_INVITE",
  "GROUP_NOT_FOUND",
  "GROUP_ARCHIVED",
  "INVALID_COLLECTION",
  "COLLECTION_NOT_FOUND",
  "COLLECTION_FORBIDDEN",
  "COLLECTION_LIMIT_REACHED",
  "INVALID_COLLECTION_ITEM",
  "COLLECTION_ITEM_LIMIT_REACHED",
  "COLLECTION_ITEM_DUPLICATE",
  "COLLECTION_ITEM_NOT_FOUND",
  "INVALID_PAGE",
  "RATE_LIMITED",
] as const;

export class VaraError extends Error {
  readonly code: VaraErrorCode;

  constructor(code: VaraErrorCode) {
    super(code);
    this.name = "VaraError";
    this.code = code;
  }
}

const NETWORK_MESSAGE = /fetch failed|failed to fetch|networkerror|network request failed|load failed/i;

export function toVaraError(error: unknown): VaraError {
  if (error instanceof VaraError) return error;
  if (error instanceof TypeError) return new VaraError("NETWORK");
  const message =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  if ((SQL_ERROR_CODES as readonly string[]).includes(message)) {
    return new VaraError(message as (typeof SQL_ERROR_CODES)[number]);
  }
  if (NETWORK_MESSAGE.test(message)) return new VaraError("NETWORK");
  return new VaraError("UNKNOWN");
}
