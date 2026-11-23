// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header, switchGenreFilterMediaType } from "./header";

const openFilter = vi.fn();

vi.mock("@/lib/view", () => ({
  useView: () => ({ openFilter }),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (!vars) return key;
    return key.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  },
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: React.ReactElement): HTMLDivElement {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
}

beforeEach(() => {
  openFilter.mockReset();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe("switchGenreFilterMediaType", () => {
  it("maps Movie Action to TV Action & Adventure and back", () => {
    const tv = switchGenreFilterMediaType(
      { kind: "genre", mediaType: "movie", name: "Action", id: 28 },
      "tv",
    );
    expect(tv).toEqual({
      kind: "genre",
      mediaType: "tv",
      name: "Action & Adventure",
      id: 10759,
    });
    const back = switchGenreFilterMediaType(tv!, "movie");
    expect(back).toEqual({
      kind: "genre",
      mediaType: "movie",
      name: "Action",
      id: 28,
    });
  });

  it("maps Movie Sci-Fi to TV Sci-Fi & Fantasy", () => {
    expect(
      switchGenreFilterMediaType(
        { kind: "genre", mediaType: "movie", name: "Sci-Fi", id: 878 },
        "tv",
      ),
    ).toEqual({
      kind: "genre",
      mediaType: "tv",
      name: "Sci-Fi & Fantasy",
      id: 10765,
    });
  });

  it("returns null for genres without a TMDB TV counterpart", () => {
    expect(
      switchGenreFilterMediaType(
        { kind: "genre", mediaType: "movie", name: "Horror", id: 27 },
        "tv",
      ),
    ).toBeNull();
  });
});

describe("Filter Header", () => {
  it("renders Movies/Shows toggle for convertible genres and switches to TV genre ID", () => {
    const el = mount(
      <Header filter={{ kind: "genre", mediaType: "movie", name: "Action", id: 28 }} />,
    );
    const moviesBtn = buttonByText(el, "Movies");
    const showsBtn = buttonByText(el, "Shows");
    expect(moviesBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(showsBtn?.getAttribute("aria-pressed")).toBe("false");

    act(() => showsBtn?.click());
    expect(openFilter).toHaveBeenCalledWith({
      kind: "genre",
      mediaType: "tv",
      name: "Action & Adventure",
      id: 10759,
    });
  });

  it("omits Movies/Shows toggle when genre has no TV counterpart", () => {
    const el = mount(
      <Header filter={{ kind: "genre", mediaType: "movie", name: "Horror", id: 27 }} />,
    );
    expect(buttonByText(el, "Shows")).toBeUndefined();
  });

  it("uses TMDB TV genre IDs inside GenreSwitcher when mediaType is tv", () => {
    const el = mount(
      <Header
        filter={{ kind: "genre", mediaType: "tv", name: "Action & Adventure", id: 10759 }}
      />,
    );
    const trigger = buttonByText(el, "Action & Adventure");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");

    const sciFi = [...el.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (b) => b.textContent?.trim() === "Sci-Fi & Fantasy",
    );
    act(() => sciFi?.click());
    expect(openFilter).toHaveBeenCalledWith({
      kind: "genre",
      mediaType: "tv",
      name: "Sci-Fi & Fantasy",
      id: 10765,
    });
  });

  it("renders All/Movies/Shows scope toggle for language filters", () => {
    const onScope = vi.fn();
    const el = mount(
      <Header
        filter={{ kind: "language", mediaType: "movie", name: "Korean", iso: "ko" }}
        languageScope="all"
        onLanguageScopeChange={onScope}
      />,
    );
    expect(buttonByText(el, "All")?.getAttribute("aria-pressed")).toBe("true");
    act(() => buttonByText(el, "Shows")?.click());
    expect(onScope).toHaveBeenCalledWith("tv");
  });
});
