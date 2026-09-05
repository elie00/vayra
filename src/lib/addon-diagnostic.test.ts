import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./safe-fetch", () => ({ safeFetch: mocks.fetch }));
import { diagnoseAddon } from "./addon-diagnostic";
afterEach(() => { mocks.fetch.mockReset(); vi.useRealTimers(); });
it("reports reachability and required configuration independently", async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", name: "A" })));
  expect(await diagnoseAddon("https://example.invalid/manifest.json")).toBe("reachable");
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", name: "A", behaviorHints: { configurationRequired: true } })));
  expect(await diagnoseAddon("https://example.invalid/manifest.json")).toBe("configuration");
});
it("never includes credentials, upstream errors or bodies in its results", async () => {
  mocks.fetch.mockResolvedValueOnce(new Response("SECRET", { status: 403 }));
  expect(await diagnoseAddon("https://example.invalid/SECRET/manifest.json")).toBe("access");
  mocks.fetch.mockRejectedValueOnce(new Error("https://example.invalid/SECRET"));
  expect(await diagnoseAddon("https://example.invalid/SECRET/manifest.json")).toBe("unavailable");
  expect(await diagnoseAddon("file:///SECRET")).toBe("invalid");
});
it("bounds a stalled native request even if abort is not implemented by the transport", async () => {
  vi.useFakeTimers(); mocks.fetch.mockImplementation(() => new Promise(() => {}));
  const result = diagnoseAddon("https://example.invalid/manifest.json");
  await vi.advanceTimersByTimeAsync(8000); expect(await result).toBe("unavailable");
});
