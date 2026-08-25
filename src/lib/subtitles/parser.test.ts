import { describe, expect, it } from "vitest";
import { findActiveCue, parseSubtitle, type SubCue } from "./parser";

describe("parseSubtitle — SRT", () => {
  it("reads a plain file", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,500
Hello

2
00:00:04,000 --> 00:00:05,000
World`;
    expect(parseSubtitle(srt)).toEqual([
      { start: 1, end: 3.5, text: "Hello" },
      { start: 4, end: 5, text: "World" },
    ]);
  });

  it("keeps a two-line cue as two lines", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
first
second`;
    expect(parseSubtitle(srt)[0].text).toBe("first\nsecond");
  });

  it("survives blank lines that are not quite blank", () => {
    // Plenty of files in the wild pad their separator line with a space, which
    // stops it splitting blocks.
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nfirst\n \n2\n00:00:03,000 --> 00:00:04,000\nsecond";
    const cues = parseSubtitle(srt);
    expect(cues.map((c) => c.text)).toEqual(["first", "second"]);
  });

  it("strips markup without eating the line", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
<i>He said &quot;go&quot;</i>`;
    expect(parseSubtitle(srt)[0].text).toBe('He said "go"');
  });
});

describe("parseSubtitle — WebVTT", () => {
  it("reads timestamps with and without an hour", () => {
    const vtt = `WEBVTT

00:01.000 --> 00:02.000
short

00:01:03.000 --> 00:01:04.000
long`;
    expect(parseSubtitle(vtt)).toEqual([
      { start: 1, end: 2, text: "short" },
      { start: 63, end: 64, text: "long" },
    ]);
  });

  it("skips a cue identifier line", () => {
    const vtt = `WEBVTT

intro
00:00:01.000 --> 00:00:02.000
Hello`;
    expect(parseSubtitle(vtt)[0]).toEqual({ start: 1, end: 2, text: "Hello" });
  });
});

describe("parseSubtitle — ASS", () => {
  const ass = `[Script Info]
Title: x

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\an8}Hello\\Nthere
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Commas, inside, the text`;

  it("reads centisecond timings", () => {
    expect(parseSubtitle(ass)[0]).toEqual({ start: 1, end: 2.5, text: "Hello\nthere" });
  });

  it("keeps commas that belong to the line", () => {
    expect(parseSubtitle(ass)[1].text).toBe("Commas, inside, the text");
  });
});

describe("findActiveCue", () => {
  const at = (cues: SubCue[], t: number) => findActiveCue(cues, t)?.text ?? null;

  it("finds the cue covering the moment", () => {
    const cues: SubCue[] = [
      { start: 0, end: 2, text: "a" },
      { start: 4, end: 6, text: "b" },
    ];
    expect(at(cues, 1)).toBe("a");
    expect(at(cues, 5)).toBe("b");
    expect(at(cues, 3)).toBeNull();
  });

  it("still finds a long cue that later short ones sit inside", () => {
    // A sign or a song line held on screen while dialogue comes and goes —
    // ordinary in ASS, and the reason a plain binary search is not enough.
    const cues: SubCue[] = [
      { start: 0, end: 10, text: "sign" },
      { start: 1, end: 2, text: "line one" },
      { start: 3, end: 4, text: "line two" },
    ];
    expect(at(cues, 8)).toBe("sign");
  });

  it("prefers the cue that started last when several overlap", () => {
    const cues: SubCue[] = [
      { start: 0, end: 10, text: "sign" },
      { start: 3, end: 4, text: "dialogue" },
    ];
    expect(at(cues, 3.5)).toBe("dialogue");
  });

  it("has nothing to show for an empty track", () => {
    expect(findActiveCue([], 5)).toBeNull();
  });
});
