import { describe, expect, it } from "vitest";
import { CiraError, toCiraError } from "./errors";
import type { CiraErrorCode } from "./types";

const SQL_CODES: CiraErrorCode[] = [
  "NOT_AUTHENTICATED",
  "BETA_ACCESS_REQUIRED",
  "PROFILE_REQUIRED",
  "INVALID_PROFILE",
  "HANDLE_UNAVAILABLE",
  "REQUEST_NOT_AVAILABLE",
  "ALREADY_RELATED",
  "INVALID_TRANSITION",
  "INVITATION_UNAVAILABLE",
  "RATE_LIMITED",
];

describe("toCiraError", () => {
  it.each(SQL_CODES)("maps the stable SQL code %s to itself", (code) => {
    const error = toCiraError({ message: code, details: "", hint: "", code: "P0001" });
    expect(error).toBeInstanceOf(CiraError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(code);
  });

  it("maps fetch-level failures to NETWORK", () => {
    expect(toCiraError({ message: "TypeError: Failed to fetch" }).code).toBe("NETWORK");
    expect(toCiraError({ message: "TypeError: fetch failed" }).code).toBe("NETWORK");
    expect(toCiraError(new TypeError("Load failed")).code).toBe("NETWORK");
  });

  it("maps anything else to UNKNOWN", () => {
    expect(toCiraError({ message: "duplicate key value violates unique constraint" }).code).toBe(
      "UNKNOWN",
    );
    expect(toCiraError(new Error("boom")).code).toBe("UNKNOWN");
    expect(toCiraError(null).code).toBe("UNKNOWN");
    expect(toCiraError("RATE_LIMITED").code).toBe("UNKNOWN");
  });

  it("keeps a hint of what failed, never its message", () => {
    // The log only said "CiraError: UNKNOWN": nothing to tell a server error from a bug.
    const err = toCiraError({ name: "PostgrestError", code: "42501", status: 403, message: "permission denied, invite K7Q2-SECRET" });
    expect(err.message).toBe("UNKNOWN");
    expect(err.hint).toBe("PostgrestError 42501 403");
    expect(toCiraError({ code: "not a short code with spaces", message: "x" }).hint).toBeUndefined();
    expect(toCiraError(new Error("boom")).hint).toBe("Error");
  });

  it("returns an existing CiraError untouched", () => {
    const original = new CiraError("PROFILE_REQUIRED");
    expect(toCiraError(original)).toBe(original);
  });

  it("never copies foreign error details into the message", () => {
    const error = toCiraError({ message: "leaked CIRA-AAAA-BBBB-CCCC-DDDD-EEEE" });
    expect(error.message).toBe("UNKNOWN");
  });
});
