import { describe, expect, it } from "vitest";
import { deriveLumaAuthority } from "./authority";

describe("LUMA playback authority", () => {
  it("keeps collaborative rooms authoritative even with no second participant or while reconnecting", () => {
    expect(deriveLumaAuthority({ castActive: false, togetherJoined: true, togetherIsHost: true, varaActive: false, varaIsHost: false })).toBe("together-host");
    expect(deriveLumaAuthority({ castActive: false, togetherJoined: false, togetherIsHost: false, varaActive: true, varaIsHost: false })).toBe("vara-guest");
  });

  it("gives cast precedence and otherwise permits solo playback", () => {
    expect(deriveLumaAuthority({ castActive: true, togetherJoined: true, togetherIsHost: true, varaActive: true, varaIsHost: true })).toBe("cast");
    expect(deriveLumaAuthority({ castActive: false, togetherJoined: false, togetherIsHost: false, varaActive: false, varaIsHost: false })).toBe("solo");
  });
});
