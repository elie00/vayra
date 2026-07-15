import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIVATE_BETA_LAUNCH_STATE,
  parsePrivateBetaLaunchState,
  privateBetaLaunchComplete,
  privateBetaLaunchStorageKey,
} from "./private-beta-launch";

describe("private beta launch state", () => {
  it("recovers from missing, corrupt, and future state", () => {
    expect(parsePrivateBetaLaunchState(null)).toEqual(DEFAULT_PRIVATE_BETA_LAUNCH_STATE);
    expect(parsePrivateBetaLaunchState("{")) .toEqual(DEFAULT_PRIVATE_BETA_LAUNCH_STATE);
    expect(parsePrivateBetaLaunchState('{"version":2,"completed":true}')).toEqual(
      DEFAULT_PRIVATE_BETA_LAUNCH_STATE,
    );
  });

  it("keeps only the versioned boolean allowlist", () => {
    expect(parsePrivateBetaLaunchState(JSON.stringify({
      version: 1,
      dismissed: true,
      roomBriefingSeen: true,
      roomOpened: false,
      completed: false,
      streamUrl: "https://forbidden.example/video",
      watchedTitle: "forbidden",
    }))).toEqual({
      version: 1,
      dismissed: true,
      roomBriefingSeen: true,
      roomOpened: false,
      completed: false,
    });
  });

  it("requires every intentional launch milestone", () => {
    expect(privateBetaLaunchComplete({
      profile: true,
      relationship: true,
      group: true,
      roomBriefing: true,
      roomOpened: false,
    })).toBe(false);
    expect(privateBetaLaunchComplete({
      profile: true,
      relationship: true,
      group: true,
      roomBriefing: true,
      roomOpened: true,
    })).toBe(true);
  });

  it("isolates local state by sanitized account id", () => {
    expect(privateBetaLaunchStorageKey("account/a")).toBe("vayra.private-beta-launch.v1:account_a");
    expect(privateBetaLaunchStorageKey("account/b")).not.toBe(privateBetaLaunchStorageKey("account/a"));
  });
});
