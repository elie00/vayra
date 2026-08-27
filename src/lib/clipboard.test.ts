import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("invite-link")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("invite-link");
  });

  it("falls back to a temporary textarea when the Clipboard API is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const select = vi.fn();
    const remove = vi.fn();
    const textarea = {
      value: "",
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      select,
      remove,
    };
    const createElement = vi.fn().mockReturnValue(textarea);
    const appendChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", {
      body: { appendChild },
      createElement,
      execCommand,
    });

    await expect(copyText("room-code")).resolves.toBe(true);
    expect(createElement).toHaveBeenCalledWith("textarea");
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.value).toBe("room-code");
    expect(select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("reports failure when neither clipboard path is available", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);

    await expect(copyText("unavailable")).resolves.toBe(false);
  });
});
