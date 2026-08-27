import { describe, expect, it, vi } from "vitest";
import { syncWebUiServer } from "./web-ui-server";

describe("syncWebUiServer", () => {
  it("starts the web server when the preference is enabled", async () => {
    const invoke = vi.fn().mockResolvedValue(11471);

    await expect(syncWebUiServer(true, async () => invoke)).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("web_serve_start");
  });

  it("stops the web server when the preference is disabled", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    await expect(syncWebUiServer(false, async () => invoke)).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("web_serve_stop");
  });

  it("preserves the native error instead of rejecting silently", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("port 11471 unavailable"));

    await expect(syncWebUiServer(true, async () => invoke)).resolves.toEqual({
      ok: false,
      message: "port 11471 unavailable",
    });
  });
});
