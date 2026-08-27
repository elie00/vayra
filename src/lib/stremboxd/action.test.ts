import { describe, expect, it, vi } from "vitest";
import { runLetterboxdAction } from "./action";

describe("runLetterboxdAction", () => {
  it("accepts a successful action response", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(runLetterboxdAction("https://example.test/action", request)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a non-success HTTP response", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(runLetterboxdAction("https://example.test/action", request)).resolves.toEqual({
      ok: false,
      message: "HTTP 429",
    });
  });

  it("preserves a network failure", async () => {
    const request = vi.fn().mockRejectedValue(new Error("connection lost"));

    await expect(runLetterboxdAction("https://example.test/action", request)).resolves.toEqual({
      ok: false,
      message: "connection lost",
    });
  });
});
