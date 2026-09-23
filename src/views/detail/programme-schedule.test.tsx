// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { programmesOf } from "@/lib/addon-epg";
import { ProgrammeSchedule } from "./programme-schedule";

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? "")),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const programmes = programmesOf([
  { id: "a", title: "Evening News", startTime: "2026-09-23T18:00:00.000Z", endTime: "2026-09-23T18:45:00.000Z" },
  { id: "b", title: "Late Film", startTime: "2026-09-23T18:45:00.000Z", endTime: "2026-09-23T20:30:00.000Z" },
]);

function render(nowIso: string): string {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowIso));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<ProgrammeSchedule programmes={programmes} />));
  const text = host.textContent ?? "";
  act(() => root.unmount());
  return text;
}

it("shows what is on now and what comes next", () => {
  const text = render("2026-09-23T18:10:00.000Z");
  expect(text).toContain("On now");
  expect(text).toContain("Evening News");
  expect(text).toContain("Up next");
  expect(text).toContain("Late Film");
});

it("says nothing is scheduled once the guide has run out", () => {
  expect(render("2026-09-23T23:00:00.000Z")).toContain("No programme information right now");
});
