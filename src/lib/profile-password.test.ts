import { describe, expect, it } from "vitest";
import {
  hashProfilePassword,
  verifyAndUpgradeProfilePassword,
  verifyProfilePassword,
} from "./profile-password";

const LEGACY_PIN_1234 = "01518c38d87661a706edc3935059fcdef892261e32f8aec8cc7ac549b5d17284";

describe("profile password hashing", () => {
  it("creates independently salted PBKDF2 hashes", async () => {
    const first = await hashProfilePassword("1234");
    const second = await hashProfilePassword("1234");
    expect(first).toMatch(/^pbkdf2-sha256\$v2\$310000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(await verifyProfilePassword("1234", first)).toBe(true);
    expect(await verifyProfilePassword("9999", first)).toBe(false);
  });

  it("verifies and upgrades legacy SHA-256 hashes", async () => {
    const result = await verifyAndUpgradeProfilePassword("1234", LEGACY_PIN_1234);
    expect(result.valid).toBe(true);
    expect(result.upgradedHash).toMatch(/^pbkdf2-sha256\$v2\$/);
    expect(await verifyProfilePassword("1234", result.upgradedHash!)).toBe(true);
  });

  it("does not upgrade an invalid legacy PIN", async () => {
    await expect(verifyAndUpgradeProfilePassword("0000", LEGACY_PIN_1234)).resolves.toEqual({
      valid: false,
      upgradedHash: null,
    });
  });
});
