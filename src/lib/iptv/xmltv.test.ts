import { describe, expect, it } from "vitest";
import { findCurrent, indexProgramsByChannel, parseXmltvTime } from "./xmltv";
import type { EpgProgram } from "./types";

function prog(startMs: number, endMs: number, title: string): EpgProgram {
  return {
    channelTvgId: "c1",
    title,
    description: null,
    category: null,
    iconUrl: null,
    startMs,
    endMs,
  };
}

describe("parseXmltvTime", () => {
  it("reads a UTC timestamp", () => {
    expect(parseXmltvTime("20260825120000 +0000")).toBe(Date.UTC(2026, 7, 25, 12, 0, 0));
  });

  it("shifts a positive offset back to UTC", () => {
    // 14:00 in Paris summer time is 12:00 UTC.
    expect(parseXmltvTime("20260825140000 +0200")).toBe(Date.UTC(2026, 7, 25, 12, 0, 0));
  });

  it("shifts a negative offset forward to UTC", () => {
    expect(parseXmltvTime("20260825070000 -0500")).toBe(Date.UTC(2026, 7, 25, 12, 0, 0));
  });

  it("handles an offset with minutes", () => {
    expect(parseXmltvTime("20260825173000 +0530")).toBe(Date.UTC(2026, 7, 25, 12, 0, 0));
  });

  it("treats a missing offset as UTC", () => {
    expect(parseXmltvTime("20260825120000")).toBe(Date.UTC(2026, 7, 25, 12, 0, 0));
  });

  it("refuses what it cannot read", () => {
    expect(Number.isNaN(parseXmltvTime("not a time"))).toBe(true);
    expect(Number.isNaN(parseXmltvTime(""))).toBe(true);
  });
});

describe("findCurrent", () => {
  const h = (n: number) => n * 3600_000;

  it("finds what is on now and what follows", () => {
    const arr = [prog(h(10), h(11), "A"), prog(h(11), h(12), "B"), prog(h(12), h(13), "C")];
    const { current, next } = findCurrent(arr, h(11) + 60_000);
    expect(current?.title).toBe("B");
    expect(next?.title).toBe("C");
  });

  it("reports the coming programme during a gap", () => {
    const arr = [prog(h(10), h(11), "A"), prog(h(12), h(13), "C")];
    const { current, next } = findCurrent(arr, h(11) + 60_000);
    expect(current).toBeNull();
    expect(next?.title).toBe("C");
  });

  it("still finds a long programme that shorter ones sit inside", () => {
    // Merged or sloppy guides do overlap; a marathon block around its parts is
    // the shape that a plain binary search walks straight past.
    const arr = [prog(h(10), h(16), "Marathon"), prog(h(11), h(12), "Part 1"), prog(h(13), h(14), "Part 2")];
    expect(findCurrent(arr, h(15))?.current?.title).toBe("Marathon");
  });

  it("has nothing to show for an empty guide", () => {
    expect(findCurrent([], h(11))).toEqual({ current: null, next: null });
    expect(findCurrent(undefined, h(11))).toEqual({ current: null, next: null });
  });
});

describe("indexProgramsByChannel", () => {
  it("groups by channel and sorts each guide by start", () => {
    const a = { ...prog(h2(12), h2(13), "late"), channelTvgId: "a" };
    const b = { ...prog(h2(10), h2(11), "early"), channelTvgId: "a" };
    const c = { ...prog(h2(10), h2(11), "other"), channelTvgId: "b" };
    const map = indexProgramsByChannel([a, b, c]);
    expect(map.get("a")?.map((p) => p.title)).toEqual(["early", "late"]);
    expect(map.get("b")?.map((p) => p.title)).toEqual(["other"]);
  });
});

function h2(n: number) {
  return n * 3600_000;
}
