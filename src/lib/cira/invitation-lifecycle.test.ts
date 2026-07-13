import { describe, expect, it } from "vitest";
import {
  ciraInvitationMinutesRemaining,
  isActiveCiraInvitation,
} from "./invitation-lifecycle";
import type { CiraInvitation } from "./types";

const NOW = Date.parse("2026-07-13T12:00:00Z");

function invitation(
  state: CiraInvitation["state"],
  expiresAt = "2026-07-13T12:15:00Z",
): CiraInvitation {
  return {
    id: "invitation-1",
    createdAt: "2026-07-13T11:45:00Z",
    expiresAt,
    state,
  };
}

describe("CIRA invitation lifecycle", () => {
  it("keeps a non-expired active invitation visible", () => {
    expect(isActiveCiraInvitation(invitation("active"), NOW)).toBe(true);
  });

  it("hides an active invitation exactly at its expiry", () => {
    expect(
      isActiveCiraInvitation(invitation("active", "2026-07-13T12:00:00Z"), NOW),
    ).toBe(false);
  });

  it.each(["accepted", "declined", "revoked", "expired"] as const)(
    "hides an invitation whose state is %s",
    (state) => {
      expect(isActiveCiraInvitation(invitation(state), NOW)).toBe(false);
    },
  );

  it("rounds remaining time up and never reports a negative value", () => {
    expect(ciraInvitationMinutesRemaining("2026-07-13T12:01:01Z", NOW)).toBe(2);
    expect(ciraInvitationMinutesRemaining("2026-07-13T11:59:00Z", NOW)).toBe(0);
  });
});
