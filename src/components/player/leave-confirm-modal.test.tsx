// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaveConfirmModal } from "./leave-confirm-modal";
import { closeLeaveConfirm, getLeaveConfirm, openLeaveConfirm } from "@/lib/player/leave-confirm";
import { settingsAnchor } from "@/views/settings/shared";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

afterEach(() => {
  closeLeaveConfirm();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LeaveConfirmModal keyboard and dialog contract", () => {
  it("exposes dialog semantics, focuses Keep watching, and never hijacks Enter", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onConfirm = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<LeaveConfirmModal />);
      });
      await act(async () => {
        openLeaveConfirm(onConfirm);
      });

      const dialog = host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.textContent).toContain("Leave playback?");

      const keepBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "Keep watching",
      )!;
      expect(document.activeElement).toBe(keepBtn);

      // Pressing Enter while Keep watching is focused must NOT leave playback.
      await act(async () => {
        keepBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      expect(onConfirm).not.toHaveBeenCalled();

      // Escape closes cleanly without confirming.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      expect(onConfirm).not.toHaveBeenCalled();
      expect(getLeaveConfirm().open).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

describe("settingsAnchor multilingual stability", () => {
  it("generates distinct non-empty slugs for French and Arabic titles", () => {
    expect(settingsAnchor("Thème et apparence")).toBe("set-thème-et-apparence");
    expect(settingsAnchor("Sous-titres")).toBe("set-sous-titres");
    const ar1 = settingsAnchor("الترجمة");
    const ar2 = settingsAnchor("المظهر");
    expect(ar1).not.toBe("set-");
    expect(ar2).not.toBe("set-");
    expect(ar1).not.toBe(ar2);
  });
});
