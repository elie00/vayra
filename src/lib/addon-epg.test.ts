import { describe, expect, it } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { hasProgrammeGuide, programmesOf, scheduleWindow } from "./addon-epg";

const at = (iso: string) => Date.parse(iso);

function programme(id: string, start: string, end: string, title = id) {
  return { id, title, released: start, startTime: start, endTime: end };
}

const news = programme("tv:news:epg:18", "2026-09-23T18:00:00.000Z", "2026-09-23T18:45:00.000Z", "Evening News");
const film = programme("tv:news:epg:19", "2026-09-23T18:45:00.000Z", "2026-09-23T20:30:00.000Z", "Film");
const late = programme("tv:news:epg:21", "2026-09-23T21:00:00.000Z", "2026-09-23T22:00:00.000Z", "Late Show");

function channel(videos: Meta["videos"], hints: Meta["behaviorHints"] = {}): Meta {
  return { id: "tv:news", type: "tv", name: "News", videos, behaviorHints: hints };
}

describe("programmesOf", () => {
  it("keeps only videos with a start strictly before their end, sorted by start", () => {
    const broken = programme("broken", "2026-09-23T10:00:00.000Z", "2026-09-23T10:00:00.000Z");
    const noTimes = { id: "plain", title: "Plain video" };
    const list = programmesOf([late, noTimes, broken, news]);
    expect(list.map((p) => p.title)).toEqual(["Evening News", "Late Show"]);
    expect(list[0]).toMatchObject({ startMs: at(news.startTime), endMs: at(news.endTime) });
  });
});

describe("hasProgrammeGuide", () => {
  it("recognises a channel whose videos are a programme guide", () => {
    expect(hasProgrammeGuide(channel([news, film]))).toBe(true);
    expect(hasProgrammeGuide(channel([news, { id: "extra", title: "Extra" }], { hasScheduledVideos: true }))).toBe(true);
  });

  it("leaves ordinary episodes and channels without a schedule alone", () => {
    expect(hasProgrammeGuide(channel([{ id: "s1e1", season: 1, episode: 1, title: "Pilot" }]))).toBe(false);
    expect(hasProgrammeGuide(channel([]))).toBe(false);
    expect(hasProgrammeGuide(channel(undefined))).toBe(false);
  });
});

describe("scheduleWindow", () => {
  const list = programmesOf([news, film, late]);

  it("returns what is on now and what comes next", () => {
    const w = scheduleWindow(list, at("2026-09-23T19:00:00.000Z"), 5);
    expect(w.current?.title).toBe("Film");
    expect(w.upcoming.map((p) => p.title)).toEqual(["Late Show"]);
  });

  it("reports a gap in the schedule instead of reusing an ended programme", () => {
    const w = scheduleWindow(list, at("2026-09-23T20:45:00.000Z"), 5);
    expect(w.current).toBeNull();
    expect(w.upcoming.map((p) => p.title)).toEqual(["Late Show"]);
  });

  it("limits the upcoming list", () => {
    const w = scheduleWindow(list, at("2026-09-23T17:00:00.000Z"), 2);
    expect(w.upcoming.map((p) => p.title)).toEqual(["Evening News", "Film"]);
  });
});
