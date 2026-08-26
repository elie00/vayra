import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Capability = {
  permissions: Array<string | { identifier: string }>;
};

async function mainCapability(): Promise<Capability> {
  const url = new URL("../../src-tauri/capabilities/default.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as Capability;
}

describe("Tauri main-window capabilities", () => {
  it("grants only the process and dialog operations used by the UI", async () => {
    const capability = await mainCapability();
    const identifiers = capability.permissions.map((permission) =>
      typeof permission === "string" ? permission : permission.identifier,
    );

    expect(identifiers).toContain("process:allow-restart");
    expect(identifiers).not.toContain("process:default");
    expect(identifiers).not.toContain("process:allow-exit");

    expect(identifiers).toEqual(
      expect.arrayContaining([
        "dialog:allow-open",
        "dialog:allow-save",
        "dialog:allow-message",
      ]),
    );
    expect(identifiers).not.toContain("dialog:default");
    expect(identifiers).not.toContain("dialog:allow-ask");
    expect(identifiers).not.toContain("dialog:allow-confirm");
  });
});
