// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerChromeConfig } from "@/lib/player-chrome";
import { ChoiceButton, Segmented } from "./shared";
import { EpisodeOrderSetting } from "./episode-order-setting";
import { SeverityPicker } from "./bug-report/severity-picker";
import { RegionPicker } from "./region-picker";
import { OptionsSection } from "./player-layout-panel/options-section";
import { LayoutPicker } from "./theme-panel/theme-studio/layout-picker";
import { Anime4kShaderList } from "./player-panel/anime4k-shader-list";
import { WebhooksPanel } from "./webhooks-panel";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  settings: {
    episodeOrderProvider: "tvdb",
    tvdbOrderPanel: false,
    tvdbSeasonType: "dvd",
    playerAnime4kFolder: "C:/anime4k",
    playerAnime4kMode: "B",
    playerAnime4kTier: "fast",
    tmdbKey: "",
    webhooks: {
      discordUrl: "",
      telegramUrl: "",
      sources: { library: true, all: false, trakt: false, anticipated: true, custom: false },
      notifyMovies: true,
      notifyTv: false,
      notifyAnime: true,
    },
    webhookRules: [],
    customCalendar: { trackedPeople: [] },
  } as Record<string, unknown>,
}));

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ settings: mocks.settings, update: mocks.update }),
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string) => key,
  useUiLanguage: () => "en",
}));
vi.mock("@/lib/region/region-name", () => ({ regionName: (_code: string, label: string) => label }));
vi.mock("@/lib/anime4k", () => ({ anime4kDir: async () => null, downloadAnime4k: async () => "" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ authKey: null }) }));
vi.mock("@/lib/trakt/provider", () => ({ useTrakt: () => ({ isConnected: false }) }));
vi.mock("@/lib/calendar", () => ({ fireWebhook: async () => ({ ok: true }) }));
vi.mock("./webhooks-panel/webhook-field", () => ({
  WebhookField: () => null,
  DiscordMark: () => null,
  DiscordTutorial: () => null,
}));
vi.mock("./webhooks-panel/telegram-field", () => ({ TelegramComposedField: () => null }));
vi.mock("./webhooks-panel/rule-builder", () => ({ RuleBuilder: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(() => root.render(node));
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text))!;
const pressed = (text: string) => button(text).getAttribute("aria-pressed");

describe("settings choices expose their state", () => {
  it("ChoiceButton is a button that says whether it is chosen, and keeps its class", () => {
    render(
      <>
        <ChoiceButton selected className="look">On</ChoiceButton>
        <ChoiceButton selected={false}>Off</ChoiceButton>
      </>,
    );
    expect(button("On").type).toBe("button");
    expect(pressed("On")).toBe("true");
    expect(pressed("Off")).toBe("false");
    expect(button("On").className).toBe("look");
  });

  it("Segmented presses only the current value", () => {
    render(
      <Segmented
        value="b"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(pressed("Alpha")).toBe("false");
    expect(pressed("Beta")).toBe("true");
  });

  it("player: Anime4K presses the current tier and mode", () => {
    render(<Anime4kShaderList />);
    expect(pressed("Performance")).toBe("true");
    expect(pressed("Quality")).toBe("false");
    expect(pressed("Mode B")).toBe("true");
    expect(pressed("Mode A+A")).toBe("false");
  });

  it("library: episode ordering presses the provider and the TVDB order", () => {
    render(<EpisodeOrderSetting />);
    expect(pressed("TVDB")).toBe("true");
    expect(pressed("Default")).toBe("false");
    expect(pressed("DVD")).toBe("true");
    expect(pressed("Aired")).toBe("false");
  });

  it("advanced: the bug severity presses the chosen level", () => {
    render(<SeverityPicker value="high" onChange={() => {}} />);
    expect(pressed("bugReport.severity.high")).toBe("true");
    expect(pressed("bugReport.severity.low")).toBe("false");
  });

  it("advanced: webhook sources and media types are switches that say whether they are on", () => {
    render(<WebhooksPanel />);
    const sw = (text: string) => {
      const b = button(text);
      expect(b.getAttribute("role")).toBe("switch");
      return b.getAttribute("aria-checked");
    };
    expect(sw("Anticipated")).toBe("true");
    // On in the settings but blocked (no Stremio sign-in): shown and announced off.
    expect(sw("My library")).toBe("false");
    expect(sw("Movies")).toBe("true");
    expect(sw("TV")).toBe("false");
  });

  it("list picker: the region list marks the current country as the selected option", () => {
    render(<RegionPicker value="FR" onChange={() => {}} />);
    act(() => button("France").click());
    const listbox = host.querySelector('[role="listbox"]')!;
    const option = (name: string) =>
      [...listbox.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(name))!;
    expect(option("France").getAttribute("aria-selected")).toBe("true");
    expect(option("Germany").getAttribute("aria-selected")).toBe("false");
  });

  it("player layout: time format and volume style press the current option", () => {
    const config = { options: { timeFormat: "remaining", volumeStyle: "stepper" } } as unknown as PlayerChromeConfig;
    render(<OptionsSection config={config} onTimeFormat={() => {}} onVolumeStyle={() => {}} />);
    expect(pressed("Remaining only")).toBe("true");
    expect(pressed("Elapsed only")).toBe("false");
    expect(pressed("Stepper")).toBe("true");
    expect(pressed("Slider")).toBe("false");
  });

  it("theme: the layout picker presses the current layout only", () => {
    render(<LayoutPicker value="sidebar" onChange={() => {}} />);
    const states = [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed"));
    expect(states.filter((s) => s === "true")).toHaveLength(1);
    expect(states.every((s) => s === "true" || s === "false")).toBe(true);
  });
});
