import { describe, expect, it } from "vitest";
import { reconcilePendingCiraInvite, type PendingCiraInvite } from "./pending-invite";

const signedOutInvite: PendingCiraInvite = { code: "CIRA-ABCD", ownerUserId: null };
const aliceInvite: PendingCiraInvite = { code: "CIRA-ABCD", ownerUserId: "alice" };

describe("reconcilePendingCiraInvite", () => {
  it("keeps a signed-out invite until the next account claims it", () => {
    expect(reconcilePendingCiraInvite(signedOutInvite, null)).toBe(signedOutInvite);
    expect(reconcilePendingCiraInvite(signedOutInvite, "alice")).toEqual({
      code: "CIRA-ABCD",
      ownerUserId: "alice",
    });
  });

  it("keeps an invite for the same account", () => {
    expect(reconcilePendingCiraInvite(aliceInvite, "alice")).toBe(aliceInvite);
  });

  it("clears an invite on sign-out or account switch", () => {
    expect(reconcilePendingCiraInvite(aliceInvite, null)).toBeNull();
    expect(reconcilePendingCiraInvite(aliceInvite, "bob")).toBeNull();
  });
});
