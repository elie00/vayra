import { describe, expect, it } from "vitest";
import type { Meta } from "./cinemeta";
import { downloadsOver, type Frame } from "./view";

const meta = { id: "tt1", type: "series", name: "Dark Matter" } as Meta;

describe("downloadsOver", () => {
  it("opens downloads above the title whose picker started the download", () => {
    const stack: Frame[] = [
      { kind: "home" },
      { kind: "meta", meta },
      { kind: "picker", meta, episode: { season: 2, episode: 1 }, intent: "download" } as Frame,
    ];
    expect(downloadsOver(stack)).toEqual([{ kind: "home" }, { kind: "meta", meta }, { kind: "downloads" }]);
  });

  it("does not stack downloads twice", () => {
    const stack: Frame[] = [{ kind: "home" }, { kind: "meta", meta }, { kind: "downloads" }];
    expect(downloadsOver(stack)).toBe(stack);
  });
});
