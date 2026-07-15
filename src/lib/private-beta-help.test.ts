import { describe, expect, it } from "vitest";
import { PRIVATE_BETA_HELP } from "./private-beta-help";

describe("private beta recovery catalog", () => {
  it("covers every promised recovery situation exactly once", () => {
    expect(PRIVATE_BETA_HELP.map((item) => item.id).sort()).toEqual([
      "access-removed",
      "group-archived",
      "host-transfer",
      "local-content",
      "reconnect",
      "room-expired",
      "sync",
    ]);
  });

  it("never asks the user to share playback or device data", () => {
    const copy = PRIVATE_BETA_HELP.map((item) => `${item.explanation} ${item.action}`).join(" ");
    expect(copy).not.toMatch(/send (?:your )?(?:url|source|addon|history|ip|device|session)/i);
  });
});
