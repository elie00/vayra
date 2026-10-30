import { useEffect, useRef, useState } from "react";
import { AccountStub } from "./settings/account";
import { CiraPanel } from "./settings/cira-panel";
import { AdvancedPanel } from "./settings/advanced-panel";
import { BasicsPanel } from "./settings/basics-panel";
import { BugReportPanel } from "./settings/bug-report-panel";
import { LibraryPanel, type LibraryKey } from "./settings/library-panel";
import { LanguagePanel } from "./settings/language-panel";
import { isSettingsSectionAvailable, SettingsNav, SettingsTabs } from "./settings/nav";
import { SettingsJumpBar } from "./settings/jump-bar";
import { SettingsUnsavedChanges } from "./settings/unsaved-changes";
import { HotkeysPanel } from "./settings/hotkeys-panel";
import { PlayerLayoutPanel } from "./settings/player-layout-panel";
import { QualityPanel } from "./settings/quality-panel";
import { MpvPanel } from "./settings/mpv-panel";
import { P2PPanel } from "./settings/p2p-panel";
import { AnimePanel } from "./settings/anime-panel";
import { TraktPanel } from "./settings/trakt-panel";
import { AnilistPanel } from "./settings/anilist-panel";
import { MalPanel } from "./settings/mal-panel";
import { SimklPanel } from "./settings/simkl-panel";
import { LetterboxdPanel } from "./settings/letterboxd-panel";
import { RelaySection, type RelayMode } from "./settings/relay-section";
import { SettingsActiveContext, type SectionId } from "./settings/shared";
import { StreamingSourcesPanel, type DebridKey } from "./settings/streaming-sources-panel";
import { StreamFiltersPanel } from "./settings/stream-filters-panel";
import { ThemePanel } from "./settings/theme-panel";
import { WebhooksPanel } from "./settings/webhooks-panel";
import { BackToTop } from "@/components/back-to-top";
import { resetOmdbBudget } from "@/lib/providers/omdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";
import { setSettingsBack } from "@/mobile/settings-back";
import { mobileEntryFor, MobileSettingsBar, MobileSettingsList, type MobileSettingsEntry } from "@/mobile/settings-list";
import { MacSettingsNav } from "./settings/mac-settings-nav";
import { MacConnectionsPanel, MacDownloadsPanel, MacPrivacyPanel } from "./settings/mac-panels";

const IS_WEB = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

const mobileSectionAnchor = (id: SectionId) => `mobile-settings-${id}`;

const SECTION_META: Record<SectionId, { label: string; sub: string }> = {
  downloads: { label: "Downloads", sub: "Your offline videos, storage folder and available space." },
  connections: { label: "Extensions and connections", sub: "Content sources and optional connected services." },
  privacy: { label: "Privacy and backups", sub: "Control your local data and keep a recoverable copy of your setup." },
  basics: {
    label: "Get started",
    sub: "The handful of settings most people set once. Sign in, choose how Play behaves, and pick your look.",
  },
  account: {
    label: "Account",
    sub: "Your VAYRA identity, profiles, and optional connections to services such as Stremio.",
  },
  cira: {
    label: "CIRA",
    sub: "Your close circle on VAYRA. Friends, invitations, presence — all opt-in, nothing public.",
  },
  library: {
    label: "Library & metadata",
    sub: "Optional keys that unlock TMDB rails, baked-in poster ratings, fanart, and TVDB episode data.",
  },
  trakt: {
    label: "Trakt",
    sub: "Connect your Trakt account to scrobble playback, sync your watchlist, and pull personalized recommendations.",
  },
  anilist: {
    label: "AniList",
    sub: "Connect your AniList account to show your anime lists as rails on the Anime page.",
  },
  mal: {
    label: "MyAnimeList",
    sub: "Connect your MyAnimeList account to sync your watch progress and browse your list.",
  },
  simkl: {
    label: "Simkl",
    sub: "Connect your Simkl account to mark what you finish as watched and sync your plan-to-watch list across apps.",
  },
  letterboxd: {
    label: "Letterboxd",
    sub: "Bring your Letterboxd watchlist, diary, liked films and lists into VAYRA via the Stremboxd bridge.",
  },
  relay: {
    label: "VAYRA Relay",
    sub: IS_WEB
      ? "VARA rooms are routed through VAYRA's hosted relay."
      : "A Cloudflare Worker on your own account that hosts your VARA rooms.",
  },
  streaming: {
    label: "Streaming sources",
    sub: "How VAYRA finds and resolves playable streams. Debrid keys and addon installs live here.",
  },
  streamFilters: {
    label: "Stream filters",
    sub: "Build a named filter once, then apply it in the source picker to trim a noisy stream list down to exactly what you want.",
  },
  p2p: {
    label: "P2P & servers",
    sub: "VAYRA's built-in peer-to-peer engine, its self-test, and any streaming server you point it at.",
  },
  language: {
    label: "Languages",
    sub: "Which audio and subtitle languages rank first in stream lists.",
  },
  player: {
    label: "Player & quality",
    sub: "Pick the playback engine and aspect, shape the audio, and set how episodes skip and advance.",
  },
  mpv: {
    label: "Video tuning",
    sub: "Match the picture quality to your computer, smooth out weak connections, and fine-tune the mpv engine with plain-language controls.",
  },
  anime: {
    label: "Anime tweaks",
    sub: "Anime4K real-time upscaling, smooth motion, and where SVP fits in. All the anime-specific picture enhancements in one place.",
  },
  playerLayout: {
    label: "Player layout",
    sub: "Pick a theme, then rearrange every button in the player chrome. Hide what you never use, promote what you do.",
  },
  hotkeys: {
    label: "Hotkeys",
    sub: "Every shortcut VAYRA responds to. Click a binding to rebind it.",
  },
  theme: {
    label: "Theme & appearance",
    sub: "Color presets, custom backgrounds, and the font pair VAYRA renders in.",
  },
  webhooks: {
    label: "Webhooks",
    sub: "Push upcoming releases to Discord or Telegram. Pick which calendars feed the notifications.",
  },
  bug: {
    label: "Report a bug",
    sub: "Send a bug report straight to the VAYRA team. Screenshots and screen recordings welcome.",
  },
  advanced: {
    label: "Advanced",
    sub: "Diagnostics, manual overrides, things most users never need.",
  },
};

type SavedKey = LibraryKey | DebridKey;

export function Settings({ active: activeView = true }: { active?: boolean } = {}) {
  const t = useT();
  const { settings, update } = useSettings();
  const [tmdbDraft, setTmdbDraft] = useState(settings.tmdbKey);
  const [omdbDraft, setOmdbDraft] = useState(settings.omdbKey);
  const [rpdbDraft, setRpdbDraft] = useState(settings.rpdbKey);
  const [fanartDraft, setFanartDraft] = useState(settings.fanartKey);
  const [tvdbDraft, setTvdbDraft] = useState(settings.tvdbKey);
  const [rdDraft, setRdDraft] = useState(settings.rdKey);
  const [tbDraft, setTbDraft] = useState(settings.tbKey);
  const [adDraft, setAdDraft] = useState(settings.adKey);
  const [pmDraft, setPmDraft] = useState(settings.pmKey);
  const [dlDraft, setDlDraft] = useState(settings.dlKey);
  const [savedKey, setSavedKey] = useState<SavedKey | null>(null);
  const { settingsSectionRequest, goBack } = useView();
  const mobile = isMobileTauri();
  // On a phone the settings open on the list of pages, or straight on the page
  // holding the section asked for; Back from a page returns to the list.
  const [mobileEntry, setMobileEntry] = useState<MobileSettingsEntry | null>(() =>
    settingsSectionRequest.section ? mobileEntryFor(settingsSectionRequest.section as SectionId) : null,
  );
  const requestedInitialSection = settingsSectionRequest.section as SectionId | null;
  const [active, setActive] = useState<SectionId>(
    requestedInitialSection && isSettingsSectionAvailable(requestedInitialSection)
      ? requestedInitialSection
      : hasNativeDesktopUx() ? "basics" : "account",
  );
  const [relayMode, setRelayMode] = useState<RelayMode>("panel");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

  const handleNav = (id: SectionId, anchor?: string) => {
    setActive(id);
    setPendingAnchor(anchor ?? null);
  };

  // A phone page can hold several sections: opening one lands on its page,
  // scrolled to it when it is not the first.
  const openMobileSection = (id: SectionId) => {
    const entry = mobileEntryFor(id);
    if (!entry) return;
    setMobileEntry(entry);
    setActive(id);
    setPendingAnchor(id === entry.sections[0] ? null : mobileSectionAnchor(id));
  };

  useEffect(() => {
    if (!mobile || !activeView || !mobileEntry) return;
    setSettingsBack(() => setMobileEntry(null));
    return () => setSettingsBack(null);
  }, [mobile, activeView, mobileEntry]);

  useEffect(() => {
    const requested = settingsSectionRequest.section as SectionId | null;
    if (!requested || !isSettingsSectionAvailable(requested)) return;
    if (mobile) openMobileSection(requested);
    else setActive(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsSectionRequest]);

  useEffect(() => {
    if (active !== "relay") setRelayMode("panel");
  }, [active]);

  const pendingAnchorRef = useRef<string | null>(null);
  pendingAnchorRef.current = pendingAnchor;

  useEffect(() => {
    if (pendingAnchorRef.current) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [active, mobileEntry]);

  useEffect(() => {
    if (!pendingAnchor) return;
    const target = pendingAnchor;
    let tries = 0;
    let timer = 0;
    const findTarget = (): HTMLElement | null => {
      const exact = document.getElementById(target);
      if (exact) return exact;
      const root = scrollRef.current;
      if (!root) return null;
      const sections = Array.from(root.querySelectorAll<HTMLElement>('section[id^="set-"]'));
      let best: HTMLElement | null = null;
      for (const s of sections) {
        if (!(s.id.startsWith(target) || target.startsWith(s.id))) continue;
        if (best == null || Math.abs(s.id.length - target.length) < Math.abs(best.id.length - target.length)) {
          best = s;
        }
      }
      return best;
    };
    const tryScroll = () => {
      const el = findTarget();
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.style.transition = "box-shadow 0.5s ease";
        el.style.boxShadow = "0 0 0 2px var(--color-accent)";
        window.setTimeout(() => {
          el.style.boxShadow = "0 0 0 0 transparent";
        }, 1300);
        window.setTimeout(() => {
          el.style.transition = "";
          el.style.boxShadow = "";
        }, 1900);
        setPendingAnchor(null);
        return;
      }
      if (tries++ < 30) timer = window.setTimeout(tryScroll, 50);
      else setPendingAnchor(null);
    };
    timer = window.setTimeout(tryScroll, 60);
    return () => window.clearTimeout(timer);
  }, [active, pendingAnchor]);

  const saveKey = (which: SavedKey, value: string) => {
    const trimmed = value.trim();
    if (which === "tmdb") update({ tmdbKey: trimmed });
    else if (which === "omdb") {
      update({ omdbKey: trimmed });
      resetOmdbBudget();
    } else if (which === "rpdb") {
      if (trimmed) update({ rpdbKey: trimmed, showImdbBadge: false, showRtBadge: false });
      else update({ rpdbKey: trimmed });
    }
    else if (which === "fanart") update({ fanartKey: trimmed });
    else if (which === "tvdb") update({ tvdbKey: trimmed });
    else if (which === "rd") update({ rdKey: trimmed });
    else if (which === "tb") update({ tbKey: trimmed });
    else if (which === "ad") update({ adKey: trimmed });
    else if (which === "pm") update({ pmKey: trimmed });
    else if (which === "dl") update({ dlKey: trimmed });
    setSavedKey(which);
    setTimeout(() => setSavedKey((s) => (s === which ? null : s)), 1400);
  };

  // The panel for one section; the phone can stack several on one page.
  const renderPanel = (id: SectionId) => (
    <>
      {id === "basics" && <BasicsPanel />}
      {id === "connections" && <MacConnectionsPanel />}
      {id === "privacy" && <MacPrivacyPanel />}
      {id === "downloads" && <MacDownloadsPanel />}

      {id === "account" && <AccountStub />}

      {id === "cira" && <CiraPanel />}

      {id === "library" && (
        <LibraryPanel
          tmdbDraft={tmdbDraft}
          omdbDraft={omdbDraft}
          rpdbDraft={rpdbDraft}
          fanartDraft={fanartDraft}
          tvdbDraft={tvdbDraft}
          setTmdbDraft={setTmdbDraft}
          setOmdbDraft={setOmdbDraft}
          setRpdbDraft={setRpdbDraft}
          setFanartDraft={setFanartDraft}
          setTvdbDraft={setTvdbDraft}
          savedKey={savedKey}
          saveKey={saveKey}
        />
      )}

      {id === "relay" && (
        <RelaySection mode={relayMode} onModeChange={setRelayMode} />
      )}

      {id === "streaming" && (
        <StreamingSourcesPanel
          rdDraft={rdDraft}
          tbDraft={tbDraft}
          adDraft={adDraft}
          pmDraft={pmDraft}
          dlDraft={dlDraft}
          setRdDraft={setRdDraft}
          setTbDraft={setTbDraft}
          setAdDraft={setAdDraft}
          setPmDraft={setPmDraft}
          setDlDraft={setDlDraft}
          savedKey={savedKey}
          saveKey={saveKey}
        />
      )}

      {id === "streamFilters" && <StreamFiltersPanel />}

      {id === "p2p" && <P2PPanel />}

      {id === "language" && <LanguagePanel />}

      {id === "player" && <QualityPanel />}

      {id === "mpv" && <MpvPanel />}

      {id === "anime" && <AnimePanel />}

      {id === "playerLayout" && <PlayerLayoutPanel />}

      {id === "hotkeys" && <HotkeysPanel />}

      {id === "trakt" && <TraktPanel />}

      {id === "anilist" && <AnilistPanel />}

      {id === "mal" && <MalPanel />}

      {id === "simkl" && <SimklPanel />}

      {id === "letterboxd" && <LetterboxdPanel />}

      {id === "theme" && <ThemePanel />}

      {id === "webhooks" && <WebhooksPanel />}

      {id === "bug" && <BugReportPanel />}

      {id === "advanced" && <AdvancedPanel />}
    </>
  );
  const panels = renderPanel(active);

  if (mobile) {
    // The relay's guide takes the whole page while it is open.
    const sections = mobileEntry && relayMode !== "panel" ? (["relay"] as SectionId[]) : mobileEntry?.sections ?? [];
    return (
      <SettingsActiveContext.Provider value={{ setActive: openMobileSection }}>
        <div className="flex h-full flex-col bg-canvas">
          <MobileSettingsBar
            title={mobileEntry ? t(mobileEntry.label) : t("nav.settings")}
            onBack={mobileEntry ? () => setMobileEntry(null) : goBack}
          />
          <main data-mobile-settings ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-[calc(4.5rem+var(--harbor-status-bar,1.75rem))]">
            {mobileEntry ? (
              <div className="flex flex-col gap-8 pb-8">
                {sections.map((id) => (
                  <div key={id} id={mobileSectionAnchor(id)} className="flex scroll-mt-24 flex-col gap-4">
                    {sections.length > 1 && <h2 className="type-title-3 font-semibold text-ink">{t(SECTION_META[id].label)}</h2>}
                    {renderPanel(id)}
                  </div>
                ))}
              </div>
            ) : (
              <MobileSettingsList onPick={(entry) => openMobileSection(entry.sections[0])} />
            )}
          </main>
          <SettingsUnsavedChanges active={activeView} />
        </div>
      </SettingsActiveContext.Provider>
    );
  }

  return (
    <SettingsActiveContext.Provider value={{ setActive }}>
    <div className="flex h-full bg-canvas max-sm:flex-col">
      {hasNativeDesktopUx() ? <MacSettingsNav active={active} onChange={handleNav} /> : <SettingsNav active={active} onChange={handleNav} />}
      <div className="hidden shrink-0 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))] max-sm:block">
        <SettingsTabs active={active} onChange={handleNav} />
      </div>
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto pt-28 pb-16 max-sm:pt-3"
      >
        <div data-tauri-drag-region className="mx-auto flex max-w-3xl flex-col gap-10 px-12 max-sm:px-4 max-sm:gap-6">
          {!(active === "relay" && relayMode !== "panel") && (
            <header className="flex flex-col gap-2">
              <h1 className={hasNativeDesktopUx() ? "mac-page-title" : "font-display text-[44px] font-medium leading-[1.05] tracking-tight text-ink"}>
                {t(hasNativeDesktopUx() && active === "basics" ? "Overview" : SECTION_META[active].label)}
              </h1>
              <p className="text-[15px] text-ink-muted">{t(SECTION_META[active].sub)}</p>
            </header>
          )}

          {panels}
        </div>
      </main>
      <BackToTop scrollRef={scrollRef} />
      <SettingsJumpBar scrollRef={scrollRef} activeSection={active} />
      <SettingsUnsavedChanges active={activeView} />
    </div>
    </SettingsActiveContext.Provider>
  );
}
