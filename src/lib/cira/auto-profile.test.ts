import { describe, expect, it, vi } from "vitest";
import { CiraError } from "./errors";
import {
  deriveDefaultDisplayName,
  deriveHandleCandidates,
  provisionCiraProfile,
  sanitizeCiraAvatarKey,
} from "./auto-profile";
import type { CiraProfile } from "./types";

const HANDLE_RX = /^[a-z0-9][a-z0-9_]{2,23}$/;

describe("deriveDefaultDisplayName", () => {
  it("uses non-placeholder local profile name and strips unsafe chars", () => {
    expect(deriveDefaultDisplayName("Elie", "elie.yvon.d@gmail.com")).toBe("Elie");
    expect(deriveDefaultDisplayName("  <Elie>\u0007 Yvon  ", "a@b.com")).toBe("Elie Yvon");
  });

  it("falls back to cleaned email local-part when local name is placeholder", () => {
    expect(deriveDefaultDisplayName("Guest 4821", "elie.yvon.d@gmail.com")).toBe("Elie Yvon D");
    expect(deriveDefaultDisplayName("Me", "alice_smith+test@example.com")).toBe("Alice Smith Test");
    expect(deriveDefaultDisplayName(null, "bob@example.com")).toBe("Bob");
  });

  it("falls back to VAYRA when both local name and email are absent", () => {
    expect(deriveDefaultDisplayName("Guest 1001", null)).toBe("VAYRA");
    expect(deriveDefaultDisplayName("", "")).toBe("VAYRA");
  });

  it("clamps display names to 48 characters", () => {
    const long = "A".repeat(80);
    expect(deriveDefaultDisplayName(long, null).length).toBe(48);
  });
});

describe("deriveHandleCandidates", () => {
  it("returns 3 valid, distinct deterministic handles matching SQL constraints", () => {
    const uid = "a1b2c3d4-e5f6-4789-9012-3456789abcdef";
    const candidates = deriveHandleCandidates("Élie Yvon", "elie.yvon.d@gmail.com", uid);

    expect(candidates).toHaveLength(3);
    expect(new Set(candidates).size).toBe(3);
    for (const handle of candidates) {
      expect(handle).toMatch(HANDLE_RX);
    }
    expect(candidates[0]).toBe("elie_yvon");
    expect(candidates[1]).toBe("elie_yvon_a1b2");
    expect(candidates[2]).toBe("vayra_a1b2c3d4");
  });

  it("handles very short, emoji-only, or overly long names safely", () => {
    const uid = "99887766-5544-3322-1100-aabbccddeeff";
    for (const [name, email] of [
      ["Jo", "jo@x.com"],
      ["🎬🔥", null],
      ["SuperLongDisplayNameThatExceedsTwentyFourCharacters", "long@example.com"],
      ["VAYRA", "elie.yvon.d@gmail.com"],
    ] as const) {
      const candidates = deriveHandleCandidates(name, email, uid);
      expect(candidates).toHaveLength(3);
      for (const h of candidates) {
        expect(h).toMatch(HANDLE_RX);
      }
    }
  });
});

describe("sanitizeCiraAvatarKey", () => {
  it("keeps valid preset avatar keys and rejects data URIs / URLs", () => {
    expect(sanitizeCiraAvatarKey("preset_01")).toBe("preset_01");
    expect(sanitizeCiraAvatarKey("avatar-fox.svg")).toBe("avatar-fox.svg");
    expect(sanitizeCiraAvatarKey("data:image/png;base64,abc")).toBeNull();
    expect(sanitizeCiraAvatarKey("https://example.com/a.png")).toBeNull();
    expect(sanitizeCiraAvatarKey("/local/path.png")).toBeNull();
    expect(sanitizeCiraAvatarKey("")).toBeNull();
    expect(sanitizeCiraAvatarKey(null)).toBeNull();
  });
});

describe("provisionCiraProfile", () => {
  it("retries up to 3 candidates on HANDLE_UNAVAILABLE and returns the created profile", async () => {
    const created: CiraProfile = {
      userId: "u1",
      handle: "elie_a1b2",
      displayName: "Elie",
      avatarKey: null,
      presenceOptIn: false,
    };
    const saveProfile = vi
      .fn()
      .mockRejectedValueOnce(new CiraError("HANDLE_UNAVAILABLE"))
      .mockResolvedValueOnce(created);

    const profile = await provisionCiraProfile(
      { saveProfile },
      {
        localProfileName: "Elie",
        email: "elie.yvon.d@gmail.com",
        userId: "a1b2c3d4-0000-0000-0000-000000000000",
        avatar: "data:image/png;base64,xyz",
      },
    );

    expect(profile).toEqual(created);
    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(saveProfile).toHaveBeenNthCalledWith(1, {
      handle: "elie",
      displayName: "Elie",
      avatarKey: null,
    });
    expect(saveProfile).toHaveBeenNthCalledWith(2, {
      handle: "elie_a1b2",
      displayName: "Elie",
      avatarKey: null,
    });
  });

  it("aborts immediately on non-collision errors like RATE_LIMITED", async () => {
    const saveProfile = vi.fn().mockRejectedValue(new CiraError("RATE_LIMITED"));

    await expect(
      provisionCiraProfile(
        { saveProfile },
        {
          localProfileName: "Elie",
          email: "elie@example.com",
          userId: "a1b2c3d4-0000-0000-0000-000000000000",
        },
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    expect(saveProfile).toHaveBeenCalledTimes(1);
  });
});
