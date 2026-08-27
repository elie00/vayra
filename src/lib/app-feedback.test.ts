import { describe, expect, it, vi } from "vitest";
import { emitAppFeedback, subscribeAppFeedback } from "./app-feedback";

describe("app feedback", () => {
  it("publishes typed feedback and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppFeedback(listener);

    emitAppFeedback({ kind: "error", text: "Connection failed" });
    expect(listener).toHaveBeenCalledWith({
      id: expect.any(Number),
      kind: "error",
      text: "Connection failed",
    });

    unsubscribe();
    emitAppFeedback({ kind: "success", text: "Saved" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
