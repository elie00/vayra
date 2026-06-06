import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  FONT_PAIRS,
  THEME_PRESETS,
  type CustomColors,
  type ThemeSettings,
} from "@/lib/theme";
import { loadBgImage, saveBgImage } from "@/lib/theme-storage";

export type StreamingService =
  | "netflix"
  | "disney"
  | "hulu"
  | "prime"
  | "apple"
  | "max"
  | "paramount"
  | "peacock";

export type WebhookTrigger =
  | { event: "newMovie" }
  | { event: "newSeries" }
  | { event: "newAnime" }
  | { event: "fromTrackedPerson"; personIds?: number[] }
  | { event: "fromGenre"; genreIds: number[]; mediaType: "movie" | "tv" }
  | { event: "fromProvider"; providerIds: number[] }
  | { event: "fromCountry"; countryCodes: string[] }
  | { event: "fromTraktAnticipated" }
  | { event: "fromTraktWatchlist" }
  | { event: "liveTvEvent"; channelIds?: string[]; favoritesOnly?: boolean; leadMinutes?: number };

export type Settings = {
  tmdbKey: string;
  omdbKey: string;
  rpdbKey: string;
  fanartKey: string;
  tvdbKey: string;
  rdKey: string;
  tbKey: string;
  adKey: string;
  pmKey: string;
  dlKey: string;
  region: string;
  preferredLanguages: string[];
  requirePreferredLanguage: boolean;
  showImdbBadge: boolean;
  showRtBadge: boolean;
  showMalBadge: boolean;
  showQualityBadge: boolean;
  badgePlacement: "top" | "bottom";
  episodeLayout: "list" | "strip";
  harborAvatar: string | null;
  harborColor: string;
  anilistAutoSync: boolean;
  useAnilistAvatar: boolean;
  useTraktAvatar: boolean;
  traktClientId: string;
  traktClientSecret: string;
  traktAccessToken: string | null;
  traktRefreshToken: string | null;
  traktExpiresAt: number;
  traktUsername: string | null;
  streaming: Record<StreamingService, boolean>;
  showAdultAddons: boolean;
  togetherRelayUrl: string;
  togetherCfToken: string;
  togetherCfAccountId: string;
  togetherCfDeployed: boolean;
  togetherShareCursors: boolean;
  discordRichPresence: boolean;
  discordHideTitle: boolean;
  discordShowWhenPaused: boolean;
  discordShowWhenBrowsing: boolean;
  discordShowPoster: boolean;
  discordShowTimestamp: boolean;
  discordShowPartyJoin: boolean;
  playerEngine: "auto" | "html5" | "mpv";
  playerShellId: string;
  seekPreviewEnabled: boolean;
  instantPlay: boolean;
  playerHdrToSdr: boolean;
  playerAnime4k: boolean;
  playerMpvEmbed: boolean;
  stremioServerTranscode: boolean;
  directTorrentStream: boolean;
  castAlwaysTranscode: boolean;
  playerAnime4kShaders: string[];
  playerAnime4kMode: string;
  playerAnime4kTier: string;
  playerAnime4kFolder: string;
  preferredSubLangs: string[];
  preferredAudioLangs: string[];
  subFontSize: number;
  subFontColor: string;
  subBorderColor: string;
  subBorderSize: number;
  subMarginY: number;
  subAlignX: "left" | "center" | "right";
  subAssOverride: "no" | "yes" | "force" | "scale" | "strip";
  subStyle: "shadow" | "outline" | "box";
  subFontFamily: string;
  customFonts: Array<{ id: string; name: string; dataUrl: string; format: string }>;
  subBoxOpacity: number;
  subBoxColor: string;
  subOpacity: number;
  subLineSpacing: number;
  subProvidersEnabled: { wyzie: boolean; opensubtitles: boolean; jimaku: boolean; addons: boolean };
  subShowInPip: boolean;
  opensubtitlesApiKey: string;
  jimakuToken: string;
  audioNormalize: boolean;
  bandwidthMbps: number;
  hideContent: ContentFilters;
  theme: ThemeSettings;
  homeMode: "harbor" | "classic";
  homeShowAllAddonRows: boolean;
  libraryBookmarkedOnly: boolean;
  useNativeTitleBar: boolean;
  cwSnapshotRetentionDays: number;
  streamFilterLevel: "strict" | "balanced" | "off";
  blockTrackers: boolean;
  homeRows: {
    order: string[];
    hidden: string[];
    renamed: Record<string, string>;
  };
  hotkeys: Record<string, string>;
  animeFavoriteGenres: number[];
  animePicksDismissedAt: number;
  animeAnilistRowsHidden: string[];
  pickerLayout: "condensed" | "stremio";
  seekBarStyle: "flat" | "glass" | "pinstripe" | "rainbow" | "image";
  seekBarHeight: number;
  seekBarColor: string;
  seekBarImage: string;
  seekDotShape: "circle" | "square" | "image" | "hidden";
  seekDotSize: number;
  seekDotImage: string;
  customCss: string;
  customJs: string;
  customHtml: string;
  webhooks: {
    discordUrl: string;
    telegramUrl: string;
    notifyMovies: boolean;
    notifyTv: boolean;
    notifyAnime: boolean;
    sources: {
      library: boolean;
      all: boolean;
      trakt: boolean;
      anticipated: boolean;
      custom: boolean;
    };
  };
  calendarSource: "library" | "all" | "trakt" | "anticipated" | "custom";
  customCalendar: {
    trackedPeople: Array<{
      id: number;
      name: string;
      profile?: string | null;
      role: "any" | "acting" | "directing";
    }>;
    includeTraktWatchlist: boolean;
    includeTraktAnticipated: boolean;
    genres: Array<{ id: number; name: string; mediaType: "movie" | "tv" }>;
    watchProviders: Array<{ id: number; name: string }>;
    originCountries: string[];
    mediaTypes: { movie: boolean; tv: boolean; anime: boolean };
  };
  webhookRules: Array<{
    id: string;
    name: string;
    enabled: boolean;
    trigger: WebhookTrigger;
    channels: { discord: boolean; telegram: boolean };
  }>;
  downloadDir: string;
  stremioDeeplinkInstall: boolean;
  iptvPlaylists: Array<{
    id: string;
    name: string;
    url: string;
    epgUrl?: string;
    kind?: "m3u" | "xtream" | "epg";
    xtream?: {
      server: string;
      username: string;
      password: string;
    };
  }>;
};

export type ContentCategory = "anime" | "liveTv" | "sports" | "adult";

export type ContentFilters = Record<ContentCategory, boolean>;

type SettingsValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  toggleStreaming: (s: StreamingService) => void;
};

const STORAGE_KEY = "harbor.settings";

const DEFAULT: Settings = {
  tmdbKey: "",
  omdbKey: "",
  rpdbKey: "",
  fanartKey: "",
  tvdbKey: "",
  rdKey: "",
  tbKey: "",
  adKey: "",
  pmKey: "",
  dlKey: "",
  region: "US",
  preferredLanguages: ["English"],
  requirePreferredLanguage: false,
  showImdbBadge: true,
  showRtBadge: true,
  showMalBadge: true,
  showQualityBadge: true,
  badgePlacement: "bottom",
  episodeLayout: "list",
  harborAvatar: null,
  harborColor: "#7dd3fc",
  anilistAutoSync: true,
  useAnilistAvatar: false,
  useTraktAvatar: false,
  traktClientId: "",
  traktClientSecret: "",
  traktAccessToken: null,
  traktRefreshToken: null,
  traktExpiresAt: 0,
  traktUsername: null,
  streaming: {
    netflix: true,
    disney: true,
    hulu: true,
    prime: true,
    apple: true,
    max: true,
    paramount: true,
    peacock: true,
  },
  showAdultAddons: false,
  togetherRelayUrl: "",
  togetherCfToken: "",
  togetherCfAccountId: "",
  togetherCfDeployed: false,
  togetherShareCursors: true,
  discordRichPresence: true,
  discordHideTitle: false,
  discordShowWhenPaused: true,
  discordShowWhenBrowsing: true,
  discordShowPoster: true,
  discordShowTimestamp: true,
  discordShowPartyJoin: false,
  playerEngine: "auto",
  playerShellId: "default",
  seekPreviewEnabled: typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) >= 4,
  instantPlay: true,
  playerHdrToSdr: true,
  playerAnime4k: false,
  playerMpvEmbed: true,
  stremioServerTranscode: false,
  directTorrentStream: true,
  castAlwaysTranscode: true,
  playerAnime4kShaders: [],
  playerAnime4kMode: "A",
  playerAnime4kTier: "hq",
  playerAnime4kFolder: "",
  preferredSubLangs: ["en"],
  preferredAudioLangs: ["en", "ja"],
  subFontSize: 32,
  subFontColor: "#FFFFFF",
  subBorderColor: "#000000",
  subBorderSize: 0,
  subMarginY: 12,
  subAlignX: "center",
  subAssOverride: "force",
  subStyle: "shadow",
  subFontFamily: "inter",
  customFonts: [],
  subBoxOpacity: 0.6,
  subBoxColor: "#000000",
  subOpacity: 1,
  subLineSpacing: 0,
  subProvidersEnabled: { wyzie: false, opensubtitles: true, jimaku: false, addons: true },
  subShowInPip: true,
  opensubtitlesApiKey: "",
  jimakuToken: "",
  audioNormalize: false,
  bandwidthMbps: 0,
  hideContent: {
    anime: false,
    liveTv: false,
    sports: false,
    adult: true,
  },
  theme: DEFAULT_THEME,
  homeMode: "harbor",
  homeShowAllAddonRows: false,
  libraryBookmarkedOnly: true,
  useNativeTitleBar: false,
  cwSnapshotRetentionDays: 30,
  streamFilterLevel: "strict",
  blockTrackers: true,
  homeRows: { order: [], hidden: [], renamed: {} },
  hotkeys: {},
  animeFavoriteGenres: [],
  animePicksDismissedAt: 0,
  animeAnilistRowsHidden: [],
  pickerLayout: "stremio",
  seekBarStyle: "flat",
  seekBarHeight: 6,
  seekBarColor: "",
  seekBarImage: "",
  seekDotShape: "circle",
  seekDotSize: 16,
  seekDotImage: "",
  customCss: "",
  customJs: "",
  customHtml: "",
  webhooks: {
    discordUrl: "",
    telegramUrl: "",
    notifyMovies: true,
    notifyTv: true,
    notifyAnime: true,
    sources: {
      library: true,
      all: false,
      trakt: false,
      anticipated: false,
      custom: false,
    },
  },
  calendarSource: "library",
  customCalendar: {
    trackedPeople: [],
    includeTraktWatchlist: false,
    includeTraktAnticipated: false,
    genres: [],
    watchProviders: [],
    originCountries: [],
    mediaTypes: { movie: true, tv: true, anime: true },
  },
  webhookRules: [],
  downloadDir: "",
  stremioDeeplinkInstall: true,
  iptvPlaylists: [],
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

function sanitizeCustomColors(c: unknown): CustomColors | null {
  if (!c || typeof c !== "object") return null;
  const obj = c as Partial<CustomColors>;
  const keys: Array<keyof CustomColors> = [
    "canvas",
    "surface",
    "elevated",
    "raised",
    "ink",
    "inkMuted",
    "inkSubtle",
    "edge",
    "accent",
    "danger",
  ];
  const out = {} as CustomColors;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v !== "string" || !HEX_RE.test(v)) return null;
    out[k] = v;
  }
  return out;
}

function sanitizeTheme(t: Partial<ThemeSettings> | undefined): ThemeSettings {
  if (!t) return DEFAULT_THEME;
  const isBuiltIn = typeof t.preset === "string" && t.preset in THEME_PRESETS;
  const isUserPreset = typeof t.preset === "string" && t.preset.startsWith("user:");
  const isPreset = isBuiltIn || isUserPreset;
  const isCustom = t.preset === "custom";
  const fontOk = typeof t.fontPair === "string" && t.fontPair in FONT_PAIRS;
  const dimOk = typeof t.backgroundDim === "number" && t.backgroundDim >= 0 && t.backgroundDim <= 1;
  const imgOk = t.backgroundImage == null || (typeof t.backgroundImage === "string" && t.backgroundImage.length < 3_000_000);
  const customColors = sanitizeCustomColors(t.customColors);
  const preset: ThemeSettings["preset"] = isPreset
    ? (t.preset as ThemeSettings["preset"])
    : isCustom && customColors
      ? "custom"
      : DEFAULT_THEME.preset;
  return {
    preset,
    fontPair: fontOk ? (t.fontPair as ThemeSettings["fontPair"]) : DEFAULT_THEME.fontPair,
    backgroundDim: dimOk ? (t.backgroundDim as number) : DEFAULT_THEME.backgroundDim,
    backgroundImage: imgOk ? (t.backgroundImage ?? null) : null,
    customColors,
  };
}

const Ctx = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    try {
      const parsed = JSON.parse(raw) as Partial<Settings> & {
        _subStyleV2?: boolean;
        _subAssForceV1?: boolean;
        _mpvEmbedV2?: boolean;
        _mpvEmbedV3?: boolean;
        _pickerLayoutStremio?: boolean;
        _stremioDeeplinkOnByDefault?: boolean;
        _anilistSyncOnV1?: boolean;
        scrapers?: unknown;
        scrapersAcknowledged?: boolean;
        _scrapersV2?: boolean;
      };
      if (!parsed._pickerLayoutStremio) {
        if (parsed.pickerLayout === "condensed") parsed.pickerLayout = "stremio";
        parsed._pickerLayoutStremio = true;
      }
      if (!parsed._stremioDeeplinkOnByDefault) {
        parsed.stremioDeeplinkInstall = true;
        parsed._stremioDeeplinkOnByDefault = true;
      }
      if (!parsed._anilistSyncOnV1) {
        parsed.anilistAutoSync = true;
        parsed._anilistSyncOnV1 = true;
      }
      if (!parsed._mpvEmbedV3) {
        parsed.playerMpvEmbed = true;
        parsed._mpvEmbedV3 = true;
      }
      if (!parsed._subStyleV2) {
        if (parsed.subFontSize === 55) parsed.subFontSize = DEFAULT.subFontSize;
        if (parsed.subBorderSize === 3) parsed.subBorderSize = DEFAULT.subBorderSize;
        if (parsed.subMarginY === 22) parsed.subMarginY = DEFAULT.subMarginY;
        parsed._subStyleV2 = true;
      }
      if (!parsed._subAssForceV1) {
        if (parsed.subAssOverride === "no") parsed.subAssOverride = "force";
        parsed._subAssForceV1 = true;
      }
      delete parsed.scrapers;
      delete parsed.scrapersAcknowledged;
      delete parsed._scrapersV2;
      return {
        ...DEFAULT,
        ...parsed,
        streaming: { ...DEFAULT.streaming, ...(parsed.streaming ?? {}) },
        subProvidersEnabled: {
          ...DEFAULT.subProvidersEnabled,
          ...(parsed.subProvidersEnabled ?? {}),
          wyzie: false,
          opensubtitles: true,
        },
        hideContent: {
          ...DEFAULT.hideContent,
          ...(parsed.hideContent ?? {}),
        },
        preferredSubLangs: parsed.preferredSubLangs ?? DEFAULT.preferredSubLangs,
        preferredAudioLangs: parsed.preferredAudioLangs ?? DEFAULT.preferredAudioLangs,
        castAlwaysTranscode: parsed.castAlwaysTranscode ?? DEFAULT.castAlwaysTranscode,
        showMalBadge: parsed.showMalBadge ?? DEFAULT.showMalBadge,
        badgePlacement:
          parsed.badgePlacement === "top" || parsed.badgePlacement === "bottom"
            ? parsed.badgePlacement
            : DEFAULT.badgePlacement,
        harborColor:
          typeof parsed.harborColor === "string" && /^#[0-9a-f]{6}$/i.test(parsed.harborColor)
            ? parsed.harborColor
            : DEFAULT.harborColor,
        traktClientId: parsed.traktClientId ?? DEFAULT.traktClientId,
        traktClientSecret: parsed.traktClientSecret ?? DEFAULT.traktClientSecret,
        traktAccessToken: parsed.traktAccessToken ?? DEFAULT.traktAccessToken,
        traktRefreshToken: parsed.traktRefreshToken ?? DEFAULT.traktRefreshToken,
        traktExpiresAt: parsed.traktExpiresAt ?? DEFAULT.traktExpiresAt,
        traktUsername: parsed.traktUsername ?? DEFAULT.traktUsername,
        theme: sanitizeTheme(parsed.theme),
        webhooks: {
          ...DEFAULT.webhooks,
          ...(parsed.webhooks ?? {}),
          sources: {
            ...DEFAULT.webhooks.sources,
            ...(parsed.webhooks?.sources ?? {}),
          },
        },
        customCalendar: {
          ...DEFAULT.customCalendar,
          ...(parsed.customCalendar ?? {}),
          trackedPeople: Array.isArray(parsed.customCalendar?.trackedPeople)
            ? parsed.customCalendar.trackedPeople
            : [],
          genres: Array.isArray(parsed.customCalendar?.genres) ? parsed.customCalendar.genres : [],
          watchProviders: Array.isArray(parsed.customCalendar?.watchProviders)
            ? parsed.customCalendar.watchProviders
            : [],
          originCountries: Array.isArray(parsed.customCalendar?.originCountries)
            ? parsed.customCalendar.originCountries
            : [],
          mediaTypes: {
            movie: parsed.customCalendar?.mediaTypes?.movie !== false,
            tv: parsed.customCalendar?.mediaTypes?.tv !== false,
            anime: parsed.customCalendar?.mediaTypes?.anime !== false,
          },
        },
        webhookRules: Array.isArray(parsed.webhookRules) ? parsed.webhookRules : [],
        animeFavoriteGenres: Array.isArray(parsed.animeFavoriteGenres)
          ? parsed.animeFavoriteGenres.filter((g): g is number => typeof g === "number")
          : DEFAULT.animeFavoriteGenres,
        animePicksDismissedAt:
          typeof parsed.animePicksDismissedAt === "number"
            ? parsed.animePicksDismissedAt
            : DEFAULT.animePicksDismissedAt,
        animeAnilistRowsHidden: Array.isArray(parsed.animeAnilistRowsHidden)
          ? parsed.animeAnilistRowsHidden.filter((k): k is string => typeof k === "string")
          : DEFAULT.animeAnilistRowsHidden,
      };
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    let cancelled = false;
    void loadBgImage().then((img) => {
      if (cancelled || !img) return;
      setSettings((s) => (s.theme.backgroundImage ? s : { ...s, theme: { ...s.theme, backgroundImage: img } }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastSavedImageRef = useRef<string | null>(null);
  useEffect(() => {
    const img = settings.theme.backgroundImage;
    if (img === lastSavedImageRef.current) return;
    lastSavedImageRef.current = img;
    void saveBgImage(img);
  }, [settings.theme.backgroundImage]);

  useEffect(() => {
    try {
      const { backgroundImage: _drop, ...themeRest } = settings.theme;
      void _drop;
      const settingsToSave = { ...settings, theme: themeRest };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (e) {
      if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
        console.warn("[settings] localStorage quota exceeded, dropping avatar");
        if (settings.harborAvatar != null) {
          setSettings((s) => ({ ...s, harborAvatar: null }));
        }
      }
    }
  }, [settings]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    const desired = new Map<string, string>();
    for (const f of settings.customFonts ?? []) {
      desired.set(`harbor-font-${f.id}`, f.dataUrl);
    }
    const added: FontFace[] = [];
    desired.forEach((dataUrl, family) => {
      let exists = false;
      document.fonts.forEach((ff) => {
        if (ff.family === family) exists = true;
      });
      if (exists) return;
      try {
        const ff = new FontFace(family, `url(${dataUrl})`, { display: "swap" });
        ff.load()
          .then((loaded) => document.fonts.add(loaded))
          .catch((e) => console.warn("[fonts] failed to load", family, e));
        added.push(ff);
      } catch (e) {
        console.warn("[fonts] FontFace ctor failed", e);
      }
    });
    return () => {
      const stillNeeded = new Set(desired.keys());
      const toRemove: FontFace[] = [];
      document.fonts.forEach((ff) => {
        if (ff.family.startsWith("harbor-font-") && !stillNeeded.has(ff.family)) {
          toRemove.push(ff);
        }
      });
      for (const ff of toRemove) document.fonts.delete(ff);
    };
  }, [settings.customFonts]);


  useEffect(() => {
    void import("@/lib/privacy/blocklist").then(({ setTrackerBlocking }) => {
      setTrackerBlocking(settings.blockTrackers);
    });
  }, [settings.blockTrackers]);

  useEffect(() => {
    void import("@/lib/snapshots").then(({ setSnapshotRetentionDays }) => {
      setSnapshotRetentionDays(settings.cwSnapshotRetentionDays);
    });
  }, [settings.cwSnapshotRetentionDays]);

  useEffect(() => {
    window.__harborStremioDeeplink = settings.stremioDeeplinkInstall;
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("deeplink_set_stremio", { enabled: settings.stremioDeeplinkInstall }).catch(
        (e) => console.warn("[harbor] deeplink_set_stremio failed", e),
      );
    });
  }, [settings.stremioDeeplinkInstall]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow()
        .setDecorations(settings.useNativeTitleBar)
        .catch((e) => console.warn("[harbor] setDecorations failed", e));
    });
  }, [settings.useNativeTitleBar]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const toggleStreaming = useCallback((svc: StreamingService) => {
    setSettings((s) => ({
      ...s,
      streaming: { ...s.streaming, [svc]: !s.streaming[svc] },
    }));
  }, []);

  const value = useMemo(
    () => ({ settings, update, toggleStreaming }),
    [settings, update, toggleStreaming],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings outside SettingsProvider");
  return v;
}
