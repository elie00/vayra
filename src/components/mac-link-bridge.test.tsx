// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { emitConnectPair } from "@/lib/deep-link";
import { MacLinkBridge } from "./mac-link-bridge";

const invoke = vi.hoisted(() => vi.fn());
const openSettings = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@/lib/view", () => ({ useView: () => ({ openSettings }) }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const CODE = "vayra://connect/pair#h=192.168.1.85:11472&k=0123&n=MacBook";

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<MacLinkBridge />));
  return () => act(() => root.unmount());
}

it("connects to the paired Mac once the status is listened to", async () => {
  invoke.mockResolvedValue(undefined);
  const unmount = await mount();
  expect(invoke).toHaveBeenCalledWith("connect_link_start");
  unmount();
});

it("asks before pairing with the Mac a scanned code points to", async () => {
  invoke.mockImplementation(async (command: string) =>
    command === "connect_link_read" ? { name: "MacBook", address: "192.168.1.85:11472" } : undefined,
  );
  const unmount = await mount();
  await act(async () => emitConnectPair(CODE));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Pair with MacBook?");
  expect(dialog.textContent).toContain("192.168.1.85:11472");
  expect(invoke).not.toHaveBeenCalledWith("connect_link_pair", expect.anything());

  const pair = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Pair")!;
  await act(async () => pair.click());
  expect(invoke).toHaveBeenCalledWith("connect_link_pair", { url: CODE });
  expect(openSettings).toHaveBeenCalledWith("advanced");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  unmount();
});

it("pairs with nothing when the code is refused", async () => {
  invoke.mockImplementation(async (command: string) => {
    if (command === "connect_link_read") throw "Not a VAYRA Connect pairing code";
  });
  const unmount = await mount();
  await act(async () => emitConnectPair(CODE));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith("connect_link_pair", expect.anything());
  unmount();
});
