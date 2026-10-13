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
