// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setNavGuard } from "./nav-guard";
import { useView, ViewProvider } from "./view";

vi.mock("./together/provider", () => ({
  useTogether: () => ({ snapshot: { state: "idle" }, leaveSession: () => {} }),
}));

afterEach(() => {
  setNavGuard(null);
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view: { current: ReturnType<typeof useView> | null } = { current: null };
  function Probe() {
    view.current = useView();
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => createRoot(container).render(<ViewProvider><Probe /></ViewProvider>));
  return () => view.current!;
}

// Settings asks before leaving with unsaved changes: the guard must be consulted
// by every way out, or the question is never asked.
describe("navigation guard", () => {
  it("holds Back and leaving Settings until the guard lets go", async () => {
    const view = await mount();
    await act(async () => view().setView("settings"));
    expect(view().view).toBe("settings");

    let proceed: (() => void) | null = null;
    setNavGuard((go) => {
      proceed = go;
      return true;
    });
    await act(async () => view().setView("home"));
    expect(view().view).toBe("settings");
    await act(async () => view().goBack());
    expect(view().view).toBe("settings");

    setNavGuard(null);
    await act(async () => proceed?.());
    expect(view().view).not.toBe("settings");
  });

  it("lets a request for another settings section through", async () => {
    const view = await mount();
    await act(async () => view().setView("settings"));
    setNavGuard(() => true);
    await act(async () => view().setView("settings"));
    expect(view().view).toBe("settings");
  });
});
