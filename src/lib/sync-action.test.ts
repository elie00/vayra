import { describe, expect, it, vi } from "vitest";
import { runSyncAction } from "./sync-action";

describe("runSyncAction", () => {
  it("confirms a completed remote mutation", async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    await expect(runSyncAction(action)).resolves.toEqual({ ok: true });
    expect(action).toHaveBeenCalledOnce();
  });

  it("preserves an Error failure", async () => {
    const action = vi.fn().mockRejectedValue(new Error("service unavailable"));

    await expect(runSyncAction(action)).resolves.toEqual({
      ok: false,
      message: "service unavailable",
    });
  });

  it("normalizes a non-Error rejection", async () => {
    const action = vi.fn().mockRejectedValue("request denied");

    await expect(runSyncAction(action)).resolves.toEqual({
      ok: false,
      message: "request denied",
    });
  });
});
