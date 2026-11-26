// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfilesProvider, useProfiles } from "./profiles";

const primary = (name: string) => JSON.stringify({
  profiles: [{ id: "p_fixture", name, avatar: null, color: "#7dd3fc", isPrimary: true, shareStremioWith: null, passwordHash: null, hideContent: null, lockedTabs: null, kid: null, createdAt: 1 }],
  activeId: "p_fixture",
});

async function launchName(): Promise<string> {
  let name = "";
  function Probe() {
    name = useProfiles().profiles[0]?.name ?? "";
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ProfilesProvider><Probe /></ProfilesProvider>));
  await act(async () => root.unmount());
  return name;
}

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

it("keeps the same guest name from one launch to the next", async () => {
  localStorage.setItem("harbor.profiles.v1", primary("Guest 3914"));
  localStorage.setItem("harbor.together.name", "Guest 7781");
  expect(await launchName()).toBe("Guest 3914");
  expect(await launchName()).toBe("Guest 3914");
});

it("still replaces a placeholder with the name chosen for watch parties", async () => {
  localStorage.setItem("harbor.profiles.v1", primary("Guest 3914"));
  localStorage.setItem("harbor.together.name", "Camille");
  expect(await launchName()).toBe("Camille");
});

it("never opens the profile picker and keeps the primary profile active & linked when legacy secondary profiles exist", async () => {
  localStorage.setItem(
    "harbor.profiles.v1",
    JSON.stringify({
      profiles: [
        { id: "p_primary", name: "Elie", avatar: null, color: "#7dd3fc", isPrimary: true, shareStremioWith: null, passwordHash: null, hideContent: null, lockedTabs: null, kid: null, settingsLinked: false, createdAt: 1 },
        { id: "p_second", name: "Second", avatar: null, color: "#60a5fa", isPrimary: false, shareStremioWith: "p_primary", passwordHash: null, hideContent: null, lockedTabs: null, kid: null, settingsLinked: false, createdAt: 2 },
      ],
      activeId: "p_second",
    }),
  );
  let snapshot: { activeId: string | null; pickerOpen: boolean; settingsLinked?: boolean } | null = null;
  function Probe() {
    const p = useProfiles();
    snapshot = { activeId: p.activeId, pickerOpen: p.pickerOpen, settingsLinked: p.activeProfile?.settingsLinked };
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ProfilesProvider><Probe /></ProfilesProvider>));
  await act(async () => root.unmount());
  expect(snapshot).toEqual({ activeId: "p_primary", pickerOpen: false, settingsLinked: true });
});
