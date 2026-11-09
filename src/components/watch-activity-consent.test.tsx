// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { confirmWatchActivityAddon } from "@/lib/watch-activity-consent";
import { WatchActivityConsent } from "./watch-activity-consent";

afterEach(() => vi.unstubAllGlobals());

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === label)!;

it("refuses when nothing is mounted to ask", async () => {
  await expect(confirmWatchActivityAddon("Scrobbler")).resolves.toBe(false);
});

it("asks for each addon in turn and answers with the user's choice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<WatchActivityConsent />));

  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => {
    first = confirmWatchActivityAddon("Trakt Scrobbler");
    second = confirmWatchActivityAddon("Simkl Sync");
  });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Trakt Scrobbler");

  act(() => button("Install").click());
  await expect(first).resolves.toBe(true);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Simkl Sync");

  act(() => button("Cancel").click());
  await expect(second).resolves.toBe(false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  act(() => root.unmount());
  host.remove();
});
