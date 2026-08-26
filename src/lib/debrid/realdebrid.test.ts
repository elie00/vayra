import { describe, expect, it } from "vitest";
import { pickLinkIndex, pickRdFiles, type RdFile } from "./realdebrid";

const file = (id: number, path: string, selected: 0 | 1 = 0): RdFile => ({
  id,
  path,
  bytes: 1_000_000,
  selected,
});

describe("pickRdFiles", () => {
  it("asks for just the file the caller named", () => {
    const files = [file(1, "/S01E01.mkv"), file(2, "/S01E02.mkv")];
    expect(pickRdFiles(files, 1)).toEqual([2]);
  });

  it("asks for every video when no file was named", () => {
    const files = [file(1, "/S01E01.mkv"), file(2, "/readme.txt"), file(3, "/S01E02.mp4")];
    expect(pickRdFiles(files, undefined)).toEqual([1, 3]);
  });

  it("falls back to everything when nothing looks like video", () => {
    const files = [file(1, "/a.bin"), file(2, "/b.dat")];
    expect(pickRdFiles(files, undefined)).toEqual([1, 2]);
  });

  it("ignores an index that is out of range", () => {
    const files = [file(1, "/only.mkv")];
    expect(pickRdFiles(files, 9)).toEqual([1]);
  });
});

describe("pickLinkIndex", () => {
  it("lines the wanted file up with its link", () => {
    // RD returns one link per selected file, in file order.
    const files = [
      file(1, "/S01E01.mkv", 1),
      file(2, "/extras.mkv", 0),
      file(3, "/S01E03.mkv", 1),
    ];
    expect(pickLinkIndex(files, 2, 2)).toBe(1);
  });

  it("takes the only link when a single file was selected", () => {
    const files = [file(1, "/S01E01.mkv", 0), file(2, "/S01E02.mkv", 1)];
    expect(pickLinkIndex(files, 1, 1)).toBe(0);
  });

  it("refuses to guess when the wanted file was never selected", () => {
    // A pack already in the account with one episode pulled: the episode asked
    // for has no link, and link 0 is a different episode entirely.
    const files = [
      file(1, "/S01E01.mkv", 1),
      file(2, "/S01E02.mkv", 0),
      file(3, "/S01E03.mkv", 0),
    ];
    expect(pickLinkIndex(files, 1, 1)).toBe(-1);
  });

  it("has no opinion without a target", () => {
    expect(pickLinkIndex([file(1, "/a.mkv", 1)], undefined, 1)).toBe(0);
    expect(pickLinkIndex(undefined, 0, 1)).toBe(0);
  });
})
