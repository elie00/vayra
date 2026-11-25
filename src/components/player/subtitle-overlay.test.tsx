// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeSubPosition } from "@/lib/player/sub-style";
import { SubtitleOverlay } from "./subtitle-overlay";

let mockMarginY = 8;

vi.mock("@/lib/profiles", () => ({
  useActiveKid: () => false,
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    settings: {
      subFontSize: 42,
      subMarginY: mockMarginY,
      subFontColor: "#FFFFFF",
      subAlignX: "center",
      subFontFamily: "inter",
      subStyle: "shadow",
      subBold: false,
      subLineSpacing: 0,
      subBorderSize: 2,
      subBorderColor: "#000000",
      subBoxOpacity: 0.6,
      subBoxColor: "#000000",
      subOpacity: 1,
    },
  }),
}));

let mountedRoot: Root | null = null;
let mountedHost: HTMLDivElement | null = null;

function mountOverlay(controlsVisible?: boolean, liftPx?: number) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!mountedHost) {
    mountedHost = document.createElement("div");
    document.body.appendChild(mountedHost);
    mountedRoot = createRoot(mountedHost);
  }
  act(() => {
    mountedRoot?.render(
      <SubtitleOverlay
        text="Hello world"
        startSec={12}
        controlsVisible={controlsVisible}
        liftPx={liftPx}
      />,
    );
  });
  return mountedHost.firstElementChild as HTMLDivElement | null;
}

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot?.unmount());
    mountedRoot = null;
  }
  if (mountedHost) {
    mountedHost.remove();
    mountedHost = null;
  }
  mockMarginY = 8;
  vi.unstubAllGlobals();
});

describe("SubtitleOverlay", () => {
  it("keeps the user's bottom margin when controls are hidden", () => {
    mockMarginY = 8;
    const el = mountOverlay(false);
    expect(el).not.toBeNull();
    expect(el?.style.bottom).toBe("8%");
    expect(el?.className).toContain("transition-[bottom]");
    expect(el?.className).toContain("motion-reduce:transition-none");
  });

  it("lifts subtitles above the controls bar when controlsVisible is true and restores on hide", () => {
    mockMarginY = 8;
    const liftedEl = mountOverlay(true);
    expect(liftedEl?.style.bottom).toBe("max(8%, 92px)");

    const restoredEl = mountOverlay(false);
    expect(restoredEl?.style.bottom).toBe("8%");
  });

  it("respects a custom liftPx when provided", () => {
    mockMarginY = 12;
    const el = mountOverlay(true, 104);
    expect(el?.style.bottom).toBe("max(12%, 104px)");
  });
});

describe("computeSubPosition (native libmpv subtitles)", () => {
  it("lifts sub-margin-y and sub-pos while controls are visible and restores exact user margin when hidden", () => {
    const settings = { subMarginY: 8, subAssOverride: "yes" as const };
    const hidden = computeSubPosition(settings, {
      assNativeActive: false,
      imageNativeActive: false,
      controlsVisible: false,
    });
    expect(hidden).toEqual({ marginY: 8, pos: 92 });

    const visible = computeSubPosition(settings, {
      assNativeActive: false,
      imageNativeActive: false,
      controlsVisible: true,
    });
    expect(visible.marginY).toBeGreaterThanOrEqual(96);
    expect(visible.pos).toBeLessThanOrEqual(85);

    const restored = computeSubPosition(settings, {
      assNativeActive: false,
      imageNativeActive: false,
      controlsVisible: false,
    });
    expect(restored).toEqual({ marginY: 8, pos: 92 });
  });

  it("preserves a user margin that is already higher than the controls lift", () => {
    const settings = { subMarginY: 25, subAssOverride: "yes" as const };
    const visible = computeSubPosition(settings, {
      assNativeActive: false,
      imageNativeActive: false,
      controlsVisible: true,
    });
    expect(visible.pos).toBe(75);
  });
});
