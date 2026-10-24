// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT } from "@/lib/settings/defaults";

const host = vi.hoisted(() => ({
  startConnect: vi.fn(),
  rotateConnect: vi.fn(),
  connectStatus: vi.fn(),
}));
vi.mock("@/lib/connect/host", () => host);
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async (text: string) => `data:qr,${text}`) } }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { ...DEFAULT, connectEnabled: true }, update: vi.fn() }) }));

import { ConnectRow } from "./connect-row";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows the pairing code and paired phones, and unpairs them all", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host.startConnect.mockResolvedValue({ pairingUrl: "vayra://connect/pair#k=one", address: "192.168.1.85:11472", name: "MacBook" });
  host.rotateConnect.mockResolvedValue({ pairingUrl: "vayra://connect/pair#k=two", address: "192.168.1.85:11472", name: "MacBook" });
  host.connectStatus.mockResolvedValue({ running: true, phones: [{ deviceId: "p", name: "Pixel 6", platform: "android" }] });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<ConnectRow />));

  const qr = () => container.querySelector("img")?.getAttribute("src");
  expect(qr()).toBe("data:qr,vayra://connect/pair#k=one");
  expect(container.textContent).toContain("Pixel 6");

  const unpair = [...container.querySelectorAll("button")].find((b) => b.textContent === "Unpair all phones")!;
  await act(async () => unpair.click());
  expect(host.rotateConnect).toHaveBeenCalled();
  expect(qr()).toBe("data:qr,vayra://connect/pair#k=two");
  expect(container.textContent).toContain("No phone connected");
  act(() => root.unmount());
});
