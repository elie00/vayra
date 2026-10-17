import { expect, it } from "vitest";
import { torrentsKeptByDownloads } from "./kept-torrents";

const engine = (hash: string, idx = 0) => `http://127.0.0.1:51572/stream/${hash}/${idx}`;
const a = "63a30ddc".padEnd(40, "0");
const b = "93d3fbef".padEnd(40, "1");
const c = "a6cb2c3d".padEnd(40, "2");

it("keeps the torrents of saves that can still resume, not of finished or canceled ones", () => {
  expect(
    torrentsKeptByDownloads([
      { status: "done", url: engine(a) },
      { status: "interrupted", url: engine(b, 3) },
      { status: "paused", url: engine(b, 4) },
      { status: "canceled", url: engine(c) },
      { status: "error", url: "https://cdn.example.invalid/movie.mkv" },
    ]),
  ).toEqual([b]);
});
