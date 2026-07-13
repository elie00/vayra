import { describe, expect, it } from "vitest";
import { hasExpiringCiraPresence } from "./presence-lifecycle";
import type { CiraRelationship } from "./types";

function relationship(
  presence: CiraRelationship["presence"],
  status: CiraRelationship["status"] = "accepted",
): CiraRelationship {
  return {
    id: "friendship-1",
    direction: status === "accepted" ? "accepted" : "incoming",
    status,
    profile: {
      userId: "user-2",
      handle: "marie",
      displayName: "Marie",
      avatarKey: null,
    },
    presence,
    createdAt: "2026-07-13T12:00:00Z",
  };
}

describe("hasExpiringCiraPresence", () => {
  it.each(["online", "in_vara"] as const)(
    "schedules a refresh for an accepted %s presence",
    (presence) => {
      expect(hasExpiringCiraPresence([relationship(presence)])).toBe(true);
    },
  );

  it("stays idle when every accepted relation is already offline", () => {
    expect(hasExpiringCiraPresence([relationship("offline")])).toBe(false);
  });

  it("never schedules from a pending relation", () => {
    expect(hasExpiringCiraPresence([relationship(null, "pending")])).toBe(false);
  });
});
