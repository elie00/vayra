// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { emitVayraAuthCallback, onVayraAuthCallback } from "./deep-link";

it("hands each auth callback to the account once, however many channels deliver it", () => {
  const handler = vi.fn();
  const stop = onVayraAuthCallback(handler);
  // Windows delivers the same link through the deep-link plugin and the single-instance event.
  emitVayraAuthCallback("vayra://auth/callback?code=first");
  emitVayraAuthCallback("vayra://auth/callback?code=first");
  emitVayraAuthCallback("vayra://auth/callback?code=second");
  stop();
  expect(handler.mock.calls).toEqual([["vayra://auth/callback?code=first"], ["vayra://auth/callback?code=second"]]);
});
