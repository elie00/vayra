import { useMemo, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { activeLayout } from "@/lib/theme";
import { useView } from "@/lib/view";
import { settingsAnchor, type SectionId } from "./shared";
import { markSectionSeen, useSettingsNew } from "./settings-new";

type IconProps = { size?: number; strokeWidth?: number };

const IconBase = ({
  size = 20,
  strokeWidth = 1.7,
  children,
}: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

function IconBasics(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="var(--color-canvas)" stroke="none" />
    </IconBase>
  );
}

function IconAccount(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <circle cx="12" cy="9.8" r="2.6" />
      <path d="M7.6 17.6c.9-2 2.6-3 4.4-3s3.5 1 4.4 3" />
    </IconBase>
  );
}

function IconLibrary(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3.5" y="3.5" width="7.5" height="9" rx="1.4" />
      <rect x="13" y="3.5" width="7.5" height="6" rx="1.4" />
      <rect x="3.5" y="14.5" width="7.5" height="6" rx="1.4" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="1.4" />
    </IconBase>
  );
}

function IconRelay(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M10.5 10 Q 12 8 13.5 10" strokeWidth="1.4" />
      <path d="M8 7.5 Q 12 4.5 16 7.5" strokeWidth="1.4" />
      <path d="M5.5 5 Q 12 1 18.5 5" strokeWidth="1.4" />
      <path d="M8 12 V 20" strokeWidth="2.4" />
      <path d="M16 12 V 20" strokeWidth="2.4" />
      <path d="M8 16 H 16" strokeWidth="2.4" />
    </IconBase>
  );
}

function IconStreaming(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 5v14" strokeWidth={p.strokeWidth ?? 2} />
      <path d="M5 12h14" strokeWidth={p.strokeWidth ?? 2} />
    </IconBase>
  );
}

function IconP2P(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M16.6 6.8l2.8-1.2M16.8 10.4l2.6 1.1" strokeWidth="1.4" />
      <path d="M7.4 6.8 4.6 5.6M7.2 10.4 4.6 11.5" strokeWidth="1.4" />
      <path d="M12 3.2 13.7 6h-3.4z" fill="currentColor" stroke="none" />
      <rect x="9.9" y="6" width="4.2" height="2.7" rx="0.5" />
      <path d="M9 20.6 10.3 8.7h3.4L15 20.6z" />
      <path d="M9.6 12.4h4.8" />
      <path d="M7.3 20.6h9.4" strokeLinecap="round" />
    </IconBase>
  );
}

function IconLanguages(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M3.5 6.5h7" />
      <path d="M7 4.5v2" />
      <path d="M9.5 6.5c-.5 4-2.4 6.5-6 7.5" />
      <path d="M4 11.5c1.6 1.5 3.6 2.5 6 2.8" />
      <path d="M13 20l3.5-9 3.5 9" />
      <path d="M14.2 17.2h4.6" />
    </IconBase>
  );
}

function IconVideoTune(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M4 7h9M18.5 7H20" />
      <circle cx="15.5" cy="7" r="2" fill="currentColor" stroke="none" />
      <path d="M4 12h2.5M11.5 12H20" />
      <circle cx="8.5" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M4 17h7.5M16.5 17H20" />
      <circle cx="13.5" cy="17" r="2" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

function IconAnime(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M9.5 3l1.6 4.4 4.4 1.6-4.4 1.6L9.5 15l-1.6-4.4L3.5 9l4.4-1.6z" fill="currentColor" stroke="none" />
      <path d="M17 13l.8 2.2 2.2.8-2.2.8L17 19l-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

function IconPlayer(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M10 9.2l4.8 2.8-4.8 2.8z" fill="currentColor" stroke="none" />
      <path d="M7 20.5h10" />
    </IconBase>
  );
}

function IconPlayerLayout(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M3 14.5h18" />
      <circle cx="7" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

function IconHotkeys(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 14h12" strokeLinecap="round" />
    </IconBase>
  );
}

function IconAdvanced(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 5.5l2.6 6.5L12 18.5l-2.6-6.5z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="var(--color-canvas)" stroke="none" />
    </IconBase>
  );
}

function IconBug(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="7.5" y="7.5" width="9" height="11" rx="4.5" />
      <path d="M9 4.5l1.5 2.5M15 4.5l-1.5 2.5" />
      <path d="M3.5 11.5h4M16.5 11.5h4" />
      <path d="M3.5 16.5l3-1.5M16.5 15l4 1.5" />
      <path d="M3.5 7l3 2M20.5 7l-3 2" />
    </IconBase>
  );
}

function IconTheme(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17 2.5 2.5 0 0 0 2.5-2.5c0-.7-.3-1.3-.7-1.8-.4-.5-.7-1-.7-1.7a2.5 2.5 0 0 1 2.5-2.5h1.4a4 4 0 0 0 4-4 8.5 8.5 0 0 0-9-4.5z" />
      <circle cx="7.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

function IconWebhooks(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="6" cy="17.5" r="2.4" />
      <circle cx="18" cy="17.5" r="2.4" />
      <circle cx="12" cy="6.5" r="2.4" />
      <path d="M10.4 8.4 7.2 15.4" />
      <path d="M13.6 8.4 16.8 15.4" />
      <path d="M8.4 17.5h7.2" />
    </IconBase>
  );
}

function IconTrakt(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 13.5l4-4 6 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9.5l4-4 8 8" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconAnilist(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M8 16.5l3-9 3 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13.5h4" strokeLinecap="round" />
      <path d="M15.5 7.5v9h2" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconSimkl(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M15 9c-2.4-1.3-4.8-.4-4.8 1.5 0 2.4 4.6 1.8 4.6 4 0 1.8-2.6 2.4-5 1" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

const LANG_ABBR: Record<string, string> = {
  English: "EN",
  Spanish: "ES",
  French: "FR",
  German: "DE",
  Italian: "IT",
  Portuguese: "PT",
  Russian: "RU",
  Japanese: "JA",
  Korean: "KO",
  Chinese: "ZH",
  Hindi: "HI",
  Arabic: "AR",
  Turkish: "TR",
  Dutch: "NL",
  Polish: "PL",
  Ukrainian: "UK",
  Czech: "CS",
  Hungarian: "HU",
  Romanian: "RO",
  Swedish: "SV",
  Norwegian: "NO",
  Danish: "DA",
  Finnish: "FI",
  Hebrew: "HE",
  Thai: "TH",
  Vietnamese: "VI",
};

type NavItem = {
  id: SectionId;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  keywords?: string[];
};

const NAV_GROUPS: Array<{ heading: string | null; items: NavItem[] }> = [
  {
    heading: null,
    items: [
      {
        id: "basics",
        label: "Get started",
        Icon: IconBasics,
        keywords: ["basics", "get started", "getting started", "setup", "quick start", "essentials", "beginner", "new user", "first time", "easy"],
      },
    ],
  },
  {
    heading: "Account",
    items: [
      {
        id: "account",
        label: "Account",
        Icon: IconAccount,
        keywords: ["stremio", "sign in", "login", "profile", "logout"],
      },
      {
        id: "library",
        label: "Library & metadata",
        Icon: IconLibrary,
        keywords: ["tmdb", "omdb", "rpdb", "fanart", "tvdb", "metadata", "api key", "ratings", "posters"],
      },
      {
        id: "trakt",
        label: "Trakt",
        Icon: IconTrakt,
        keywords: ["scrobble", "history", "sync", "watchlist"],
      },
      {
        id: "anilist",
        label: "AniList",
        Icon: IconAnilist,
        keywords: ["anime", "lists", "watching", "mal", "kitsu"],
      },
      {
        id: "simkl",
        label: "Simkl",
        Icon: IconSimkl,
        keywords: ["scrobble", "sync", "watched", "history", "watchlist", "anime"],
      },
    ],
  },
  {
    heading: "Streaming",
    items: [
      {
        id: "relay",
        label: "Harbor Relay",
        Icon: IconRelay,
        keywords: ["together", "watch party", "p2p", "host", "share"],
      },
      {
        id: "streaming",
        label: "Streaming sources",
        Icon: IconStreaming,
        keywords: [
          "debrid",
          "real-debrid",
          "alldebrid",
          "premiumize",
          "torbox",
          "torrentio",
          "mediafusion",
          "scrapers",
          "addons",
          "iptv",
          "m3u",
          "xtream",
        ],
      },
      {
        id: "p2p",
        label: "P2P & servers",
        Icon: IconP2P,
        keywords: [
          "p2p",
          "peer to peer",
          "torrent engine",
          "local engine",
          "librqbit",
          "built-in engine",
          "rust engine",
          "self-test",
          "self test",
          "peer test",
          "restart engine",
          "clear and restart",
          "streaming server",
          "server address",
          "localhost",
          "11470",
          "11471",
          "remote server",
          "stremio server",
          "direct torrent",
          "seeders",
          "connecting",
          "dht",
        ],
      },
    ],
  },
  {
    heading: "Playback",
    items: [
      {
        id: "player",
        label: "Player & quality",
        Icon: IconPlayer,
        keywords: ["mpv", "html5", "engine", "quality", "hdr", "passthrough", "audio", "transcode", "tonemap", "true hdr", "separate window", "hdr no ui", "hdr controls missing", "brightness dimming", "washed out", "dolby vision"],
      },
      {
        id: "mpv",
        label: "Video tuning",
        Icon: IconVideoTune,
        keywords: ["mpv", "advanced mpv", "mpv.conf", "mpv options", "video quality", "picture quality", "performance", "potato", "low end", "weak pc", "shit computer", "hardware decoding", "hwdec", "buffer", "downmix", "upscaling", "scaling", "tonemap", "tuning", "quality preset"],
      },
      {
        id: "anime",
        label: "Anime tweaks",
        Icon: IconAnime,
        keywords: ["anime", "anime4k", "anime 4k", "upscale", "upscaling", "shaders", "smooth motion", "motion smoothing", "interpolation", "svp", "smoothvideo", "frame interpolation", "60fps", "48fps", "fluid"],
      },
      {
        id: "playerLayout",
        label: "Player layout",
        Icon: IconPlayerLayout,
        keywords: ["controls", "ui", "overlay", "skip", "trickplay", "thumbnail"],
      },
      {
        id: "hotkeys",
        label: "Hotkeys",
        Icon: IconHotkeys,
        keywords: ["shortcuts", "keys", "keyboard", "bindings"],
      },
      {
        id: "language",
        label: "Languages",
        Icon: IconLanguages,
        keywords: ["subtitles", "audio", "preferred", "tracks", "opensubtitles"],
      },
    ],
  },
  {
    heading: "Appearance",
    items: [
      {
        id: "theme",
        label: "Theme & appearance",
        Icon: IconTheme,
        keywords: ["theme", "color", "font", "layout", "wallpaper", "card", "minui", "aurora", "velvet", "custom"],
      },
    ],
  },
  {
    heading: "Notifications",
    items: [
      {
        id: "webhooks",
        label: "Webhooks",
        Icon: IconWebhooks,
        keywords: ["discord", "telegram", "calendar", "alerts", "notifications", "rules"],
      },
    ],
  },
  {
    heading: "Help",
    items: [
      { id: "bug", label: "Report a bug", Icon: IconBug, keywords: ["report", "feedback", "issue", "crash"] },
    ],
  },
  {
    heading: "System",
    items: [
      {
        id: "advanced",
        label: "Advanced",
        Icon: IconAdvanced,
        keywords: ["dev", "logs", "cache", "reset", "experimental", "ffmpeg", "yt-dlp"],
      },
    ],
  },
];

type SettingsOption = { label: string; section: SectionId; anchorTitle?: string; keywords?: string[] };

const SETTINGS_OPTIONS: SettingsOption[] = [
  // PLAYBACK (QualityPanel). Display/subtitle/library/advanced rows were relocated; the section field is authoritative, not this grouping.
  { label: "Play button behavior", section: "player", anchorTitle: "Play button behavior", keywords: ["play mode", "instant", "instant play", "autoplay", "auto start", "manual picker", "choose stream", "source picker", "quality picker"] },
  { label: "Player engine", section: "player", anchorTitle: "Player engine", keywords: ["mpv", "html5", "engine", "playback", "embed mpv", "inline", "separate window", "hdr", "sdr", "tonemap", "tonemapping", "hdr display mode", "hdr separate window", "opaque", "passthrough", "line-free", "line free", "brightness line", "motion smoothing", "frame interpolation", "direct torrent", "stremio server", "built-in engine", "rust engine", "p2p", "re-encode", "transcode", "cast", "dlna", "anime4k", "upscale", "upscaling", "anime4k indicator", "fps", "av1", "dts-hd", "truehd", "codec"] },
  { label: "Aspect ratio", section: "player", anchorTitle: "Aspect ratio", keywords: ["aspect ratio", "fit", "fill", "zoom", "crop", "stretch", "black bars", "widescreen", "4:3", "16:9", "21:9"] },
  { label: "Seek bar", section: "theme", anchorTitle: "Seek bar", keywords: ["seek", "seek bar", "scrubber", "progress", "timeline", "thumbnail preview", "trickplay", "hover preview", "bar style", "flat", "glass", "pinstripe", "rainbow", "bar height", "bar color", "bar image", "seek dot", "dot shape", "circle", "square", "custom dot", "hidden dot", "dot size", "nyan cat", "sticker"] },
  { label: "Subtitle style", section: "language", anchorTitle: "Subtitle style", keywords: ["subtitle", "subtitles", "subs", "caption", "sub style", "drop shadow", "outline", "black bar", "ass", "styled subs", "background opacity", "outline thickness", "bold", "pip subtitles", "picture in picture", "subtitle size", "subtitle opacity", "distance from bottom", "margin", "alignment", "left", "center", "right", "text color", "outline color", "box color", "font", "inter", "rounded", "serif", "arabic font", "upload font", "custom font", "reset"] },
  { label: "Stream format chips", section: "theme", anchorTitle: "Stream format chips", keywords: ["format chips", "quality badge", "resolution chip", "hdr chip", "codec tag", "audio format", "badges on rows", "4k badge"] },
  { label: "Poster size", section: "theme", anchorTitle: "Poster size", keywords: ["poster size", "card size", "compact", "default", "large", "huge", "scale", "grid", "bigger posters"] },
  { label: "Row & player title size", section: "theme", anchorTitle: "Title text", keywords: ["title", "text size", "row title", "player title", "series first", "series name first", "episode name", "header", "font size", "bigger text"] },
  { label: "Interface scale (accessibility)", section: "theme", anchorTitle: "Accessibility", keywords: ["accessibility", "interface scale", "ui scale", "zoom", "readability", "4k display", "ultrawide", "bigger ui", "text size"] },
  { label: "Trailer quality", section: "theme", anchorTitle: "Trailer quality", keywords: ["trailer", "trailer quality", "youtube", "ytdl", "ytdlp", "360p", "720p", "1080p", "best"] },
  { label: "Audio (normalize, bass, night mode)", section: "player", anchorTitle: "Audio", keywords: ["audio", "normalize loudness", "audio normalize", "normalization", "loudness", "dialogue", "dynamic", "loud", "distorted", "boost", "audio profile", "bass boost", "vocal clarity", "voice", "less bass", "night mode", "compress", "equalizer", "eq"] },
  { label: "Skip intros", section: "player", anchorTitle: "Skip intros", keywords: ["skip intro", "skip intros", "skip opening", "auto-skip", "auto skip", "aniskip", "theintroodb", "skip button"] },
  { label: "Next episode prompt & auto-play", section: "player", anchorTitle: "Next episode prompt", keywords: ["next episode", "up next", "prompt", "timing", "autoplay", "auto-play next", "auto play next episode", "continuous", "credits", "pill", "binge"] },
  { label: "Hide watched in catalogs", section: "library", anchorTitle: "Home layout", keywords: ["hide watched", "hide finished", "watched filter", "catalog filter", "trakt history", "seen"] },
  { label: "Downloads folder", section: "advanced", anchorTitle: "Downloads", keywords: ["downloads", "download folder", "location", "directory", "save", "path", "choose folder", "open folder"] },
  { label: "Local torrent engine", section: "p2p", anchorTitle: "Local engine", keywords: ["local engine", "torrent engine", "p2p", "librqbit", "self-test", "self test", "restart engine", "peer test", "connectivity"] },
  { label: "Your streaming server address", section: "p2p", anchorTitle: "Your streaming server address", keywords: ["streaming server", "server address", "localhost", "wifi", "lan", "start server", "stop server", "restart server", "harbor in browser", "web ui", "11470", "11471", "web version", "use exclusively", "strict"] },
  { label: "Remote streaming server", section: "p2p", anchorTitle: "Remote streaming server", keywords: ["remote server", "server url", "ip address", "test connection", "forget server", "use exclusively", "strict", "vpn", "home server", "stremio service"] },
  { label: "Anime4K presets & modes", section: "player", anchorTitle: "Anime4K presets", keywords: ["anime4k", "setup", "download shaders", "install anime4k", "re-download", "quality", "performance", "mode a", "mode b", "mode c", "apply to anime only", "anime detection"] },
  { label: "Internet speed / bandwidth", section: "player", anchorTitle: "Internet speed", keywords: ["internet speed", "bandwidth", "cap", "limit", "mbps", "gbps", "speed test", "fiber", "gigabit", "data"] },
  { label: "Remember last stream", section: "player", anchorTitle: "Remember last stream", keywords: ["remember last stream", "resume stream", "last source", "addon memory", "source memory"] },
  { label: "Custom CSS / JS / HTML code", section: "advanced", anchorTitle: "Custom code", keywords: ["custom code", "custom css", "custom js", "javascript", "custom html overlay", "inject", "mod", "power user", "retheme"] },

  // VIDEO TUNING (MpvPanel)
  { label: "Picture quality (weak PC / balanced / max)", section: "mpv", anchorTitle: "Picture quality", keywords: ["picture quality", "video quality", "performance", "potato", "weak pc", "low end", "old computer", "slow", "max quality", "upscaling", "scaling", "quality preset", "mpv profile", "gpu load"] },
  { label: "Hardware acceleration (hwdec)", section: "mpv", anchorTitle: "Hardware acceleration", keywords: ["hardware acceleration", "hwdec", "gpu decoding", "graphics card", "cpu", "decode", "battery"] },
  { label: "Picture adjustments (brightness, contrast, sharpen)", section: "mpv", anchorTitle: "Picture adjustments", keywords: ["brightness", "contrast", "saturation", "gamma", "sharpen", "sharpness", "picture", "image", "too dark", "dark scenes", "vivid", "punchy color", "dim", "calibrate"] },
  { label: "Color & HDR tone-mapping", section: "mpv", anchorTitle: "Color & HDR", keywords: ["tone-mapping", "tonemap", "hdr", "inverse tone mapping", "sdr to hdr", "color curve", "bt.2390", "hable", "mobius", "reinhard", "washed out"] },
  { label: "Bigger buffer for slow connections", section: "mpv", anchorTitle: "Slow or unstable connection", keywords: ["buffer", "buffering", "slow connection", "unstable", "wifi", "cache", "readahead", "stutter", "pausing"] },
  { label: "Downmix surround to stereo", section: "mpv", anchorTitle: "Audio", keywords: ["downmix", "stereo", "surround", "5.1", "7.1", "laptop speakers", "headphones", "quiet dialogue", "audio channels"] },
  { label: "Advanced mpv options (mpv.conf)", section: "mpv", anchorTitle: "Advanced (mpv.conf)", keywords: ["advanced mpv", "mpv.conf", "mpv options", "extra options", "tone-mapping", "inverse tone mapping", "custom mpv", "key=value", "power user", "raw config"] },

  // ANIME (AnimePanel)
  { label: "Anime4K upscaling", section: "anime", anchorTitle: "Anime4K upscaling", keywords: ["anime4k", "anime 4k", "upscale", "upscaling", "shaders", "sharper anime", "anime only", "anime4k indicator", "fps badge", "gpu upscale"] },
  { label: "Smooth motion (interpolation) & SVP", section: "anime", anchorTitle: "Smooth motion", keywords: ["smooth motion", "motion smoothing", "interpolation", "frame interpolation", "svp", "smoothvideo", "60fps", "48fps", "fluid", "judder", "soap opera", "vapoursynth"] },

  // LIBRARY & METADATA (LibraryPanel)
  { label: "Home layout", section: "library", anchorTitle: "Home layout", keywords: ["home layout", "rails", "rows", "addon rows", "duplicate rails", "watchlist saved only", "playlists tab", "m3u", "xtream", "keep anime in anime room", "continue watching advance", "advance next episode"] },
  { label: "Spoilers (blur)", section: "library", anchorTitle: "Spoilers", keywords: ["spoiler", "spoilers", "blur", "blur thumbnails", "blur titles", "blur descriptions", "hide spoilers", "next episode visible"] },
  { label: "Continue Watching screenshots", section: "library", anchorTitle: "Continue Watching screenshots", keywords: ["continue watching", "screenshots", "snapshots", "frames", "retention", "clear frames", "storage"] },
  { label: "Region & language", section: "library", anchorTitle: "Region & language", keywords: ["region", "country", "availability", "location", "iso"] },
  { label: "Metadata providers (TMDB, OMDb, RPDB, MDBList, Fanart, TVDB)", section: "library", anchorTitle: "Metadata providers", keywords: ["metadata", "tmdb", "omdb", "rpdb", "mdblist", "letterboxd", "fanart", "tvdb", "api key", "ratings", "scores", "custom poster service", "btttr", "posters", "hide titles under posters", "imdb score", "rotten tomatoes", "mal score", "hover preview", "peek", "badge position"] },
  { label: "Content filters (hide anime / live tv / sports / adult)", section: "library", anchorTitle: "Content filters", keywords: ["content filters", "hide anime", "hide live tv", "hide sports", "hide adult", "age", "filter"] },

  // LANGUAGES (LanguagePanel)
  { label: "Display language", section: "language", anchorTitle: "Display language", keywords: ["display language", "ui language", "interface language", "rtl", "arabic", "menus", "buttons", "translation"] },
  { label: "Subtitle languages & autoload", section: "language", anchorTitle: "Subtitle languages", keywords: ["subtitle languages", "preferred subs", "start with subtitles off", "subs off", "prefer embedded", "forced subs", "native audio", "never auto-select", "block tracks", "commentary", "descriptive"] },
  { label: "Metadata language", section: "language", anchorTitle: "Metadata language", keywords: ["metadata language", "tmdb titles", "overviews", "taglines", "translation"] },
  { label: "Audio languages", section: "language", anchorTitle: "Audio languages", keywords: ["audio languages", "dub", "audio tracks", "preferred audio"] },
  { label: "Preferred languages", section: "language", anchorTitle: "Preferred languages", keywords: ["preferred languages", "rank", "priority", "only show my languages", "filter streams", "multi-audio"] },

  // STREAMING SOURCES (StreamingSourcesPanel)
  { label: "Stream safety filter", section: "streaming", anchorTitle: "Stream safety filter", keywords: ["safety filter", "stream filter", "shady", "mismatched", "scam", "fake", "rejection", "aggression", "filter level"] },
  { label: "Picker layout (Condensed / Stremio)", section: "streaming", anchorTitle: "Picker layout", keywords: ["picker layout", "condensed", "stremio", "sources", "drawer", "list"] },
  { label: "Result order (ranking / addon order)", section: "streaming", anchorTitle: "Result order", keywords: ["result order", "ranking", "addon order", "sort", "priority", "sequence", "vidi"] },
  { label: "Debrid services (RealDebrid / TorBox / AllDebrid / Premiumize / Debrid-Link)", section: "streaming", anchorTitle: "Debrid services", keywords: ["debrid", "real-debrid", "realdebrid", "torbox", "alldebrid", "premiumize", "debrid-link", "api token", "cache", "rd", "tb"] },
  { label: "Usenet (Easynews+)", section: "streaming", anchorTitle: "Usenet", keywords: ["usenet", "easynews", "nzb", "addon"] },
  { label: "Streaming catalogs (Netflix, Disney+, etc.)", section: "streaming", anchorTitle: "Streaming catalogs", keywords: ["streaming catalogs", "netflix", "disney", "hulu", "prime", "apple tv", "max", "paramount", "peacock", "providers", "services"] },

  // WATCH TOGETHER (RelaySection)
  { label: "Watch Together relay", section: "relay", anchorTitle: "Harbor Relay", keywords: ["watch together", "relay", "party", "p2p", "host", "cloudflare", "deploy", "share"] },

  // THEME & APPEARANCE (ThemePanel)
  { label: "Theme preset", section: "theme", anchorTitle: "Theme", keywords: ["theme", "color", "preset", "cool grey", "warm gold", "deep purple", "sunset orange", "rose pink", "custom theme", "palette", "dark", "appearance"] },
  { label: "Background image / wallpaper", section: "theme", anchorTitle: "Background image", keywords: ["background", "wallpaper", "image", "choose image", "replace", "remove", "dim overlay"] },
  { label: "Typography & custom fonts", section: "theme", anchorTitle: "Typography", keywords: ["typography", "font", "display font", "body font", "serif", "sans", "font pair", "custom font", "fraunces", "inter", "upload font"] },
  { label: "Theme Studio / your themes", section: "theme", anchorTitle: "Your themes", keywords: ["theme studio", "custom theme", "editor", "browse theme library", "import theme", "your themes", "card css"] },
  { label: "Window title bar", section: "theme", anchorTitle: "Window title bar", keywords: ["window title bar", "native title bar", "system title bar", "decorations"] },
  { label: "Home hero shadow", section: "theme", anchorTitle: "Home hero shadow", keywords: ["hero shadow", "home hero", "hero gradient", "featured title", "darken hero", "backdrop shadow", "gradient overlay", "show artwork"] },

  // ADVANCED (AdvancedPanel)
  { label: "Updates & rollback", section: "advanced", anchorTitle: "Updates", keywords: ["updates", "version", "check for updates", "beta updates", "roll back", "rollback", "downgrade", "previous version", "build feedback"] },
  { label: "Backup & restore", section: "advanced", anchorTitle: "Backup & restore", keywords: ["backup", "restore", "export", "import", "settings file"] },
  { label: "Privacy & tracker blocking", section: "advanced", anchorTitle: "Privacy", keywords: ["privacy", "block ads", "trackers", "analytics", "telemetry", "ad blocker"] },
  { label: "System tray & window behavior", section: "advanced", anchorTitle: "System tray", keywords: ["system tray", "close to tray", "minimize", "always on top", "pause when minimized", "pause when unfocused", "background"] },
  { label: "Stremio install links", section: "advanced", anchorTitle: "Stremio install links", keywords: ["stremio install links", "deeplink", "protocol handler", "install addon"] },
  { label: "Discord Rich Presence", section: "advanced", anchorTitle: "Discord Rich Presence", keywords: ["discord", "rich presence", "now watching", "status", "hide title", "show while paused", "browsing", "poster", "elapsed time", "watch party join"] },
  { label: "API budget (OMDb)", section: "advanced", anchorTitle: "API budget", keywords: ["api budget", "omdb budget", "daily requests", "counter", "rate limit"] },
  { label: "Onboarding & hints", section: "advanced", anchorTitle: "Onboarding", keywords: ["onboarding", "walkthrough", "tutorial", "replay", "restore hints", "tips"] },
  { label: "Stremio library repair", section: "advanced", anchorTitle: "Stremio library repair", keywords: ["stremio library repair", "fix library", "schema", "repair"] },
  { label: "About (version / build)", section: "advanced", anchorTitle: "About", keywords: ["about", "version", "build", "platform", "bug reports"] },

  // ACCOUNT (AccountStub)
  { label: "Harbor identity (avatar / color)", section: "account", anchorTitle: "Harbor identity", keywords: ["avatar", "profile photo", "upload photo", "color", "identity", "picture"] },
  { label: "Stremio account (email / sign out)", section: "account", anchorTitle: "Stremio account", keywords: ["stremio", "email", "sign out", "logout", "re-authenticate", "login", "account"] },
  { label: "Synced addons", section: "account", anchorTitle: "Synced addons", keywords: ["synced addons", "addons", "stremio addons", "installed addons"] },

  // PANEL-LEVEL (no Section anchor — these navigate to the panel)
  { label: "Trakt connection", section: "trakt", keywords: ["trakt", "scrobble", "sync", "watchlist", "connect", "disconnect", "avatar", "history"] },
  { label: "AniList connection", section: "anilist", keywords: ["anilist", "anime", "lists", "sync", "connect", "disconnect", "avatar", "watch progress", "mal", "kitsu"] },
  { label: "Simkl connection", section: "simkl", keywords: ["simkl", "sync", "watched", "watchlist", "connect", "disconnect", "avatar", "anime"] },
  { label: "Webhooks (Discord / Telegram)", section: "webhooks", keywords: ["webhooks", "discord", "telegram", "notifications", "alerts", "calendar sources", "rules", "upcoming"] },
  { label: "Hotkeys / keyboard shortcuts", section: "hotkeys", keywords: ["hotkeys", "shortcuts", "keybindings", "keyboard", "rebind", "reset shortcuts"] },
  { label: "Player layout / chrome", section: "playerLayout", keywords: ["player layout", "chrome", "controls", "buttons", "overlay", "arrange", "rearrange", "trickplay", "thumbnail", "hide buttons"] },
  { label: "Report a bug", section: "bug", keywords: ["bug report", "report", "feedback", "issue", "crash", "screenshot", "diagnostics"] },
];

export function SettingsNav({
  active,
  onChange,
}: {
  active: SectionId;
  onChange: (id: SectionId, anchor?: string) => void;
}) {
  const { settings } = useSettings();
  const { goBack, canGoBack, setView } = useView();
  const t = useT();
  const isNew = useSettingsNew();
  const navLayout = activeLayout(settings.theme);
  const showBack = navLayout === "custom" || navLayout === "minui";
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const sectionLabel = useMemo(() => {
    const m = new Map<SectionId, string>();
    for (const group of NAV_GROUPS) for (const item of group.items) m.set(item.id, item.label);
    return m;
  }, []);
  const matches = useMemo<NavItem[] | null>(() => {
    if (!trimmed) return null;
    const out: NavItem[] = [];
    for (const group of NAV_GROUPS) {
      const groupHit = group.heading?.toLowerCase().includes(trimmed) ?? false;
      for (const item of group.items) {
        const hit =
          groupHit ||
          item.label.toLowerCase().includes(trimmed) ||
          (item.keywords ?? []).some((k) => k.toLowerCase().includes(trimmed));
        if (hit) out.push(item);
      }
    }
    return out;
  }, [trimmed]);
  const optionMatches = useMemo<SettingsOption[] | null>(() => {
    if (!trimmed) return null;
    return SETTINGS_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(trimmed) ||
        (o.keywords ?? []).some((k) => k.toLowerCase().includes(trimmed)),
    );
  }, [trimmed]);

  const libraryKeys = [
    settings.tmdbKey,
    settings.omdbKey,
    settings.rpdbKey,
    settings.fanartKey,
    settings.tvdbKey,
  ].filter(Boolean).length;

  const debridKeys = [
    settings.rdKey,
    settings.tbKey,
    settings.adKey,
    settings.pmKey,
    settings.dlKey,
  ].filter(Boolean).length;

  const debridChip = libraryKeys > 0 ? `${libraryKeys}/5` : null;

  const relayLive = settings.togetherRelayUrl ? "live" : null;
  const langChip =
    settings.preferredLanguages.length === 0
      ? null
      : settings.preferredLanguages.length > 1
      ? "MULTI"
      : LANG_ABBR[settings.preferredLanguages[0]] ??
        settings.preferredLanguages[0].slice(0, 3).toUpperCase();

  const webhookActive =
    (settings.webhooks.discordUrl || settings.webhooks.telegramUrl) &&
    Object.values(settings.webhooks.sources).some(Boolean);

  const status: Record<SectionId, string | null> = {
    basics: null,
    account: null,
    library: libraryKeys > 0 ? `${libraryKeys}/5` : null,
    trakt: null,
    anilist: null,
    simkl: null,
    relay: relayLive,
    streaming: debridChip,
    p2p: null,
    language: langChip,
    player: settings.playerEngine === "auto" ? null : settings.playerEngine,
    mpv: (settings.mpvQuality ?? "balanced") === "balanced" ? null : settings.mpvQuality === "performance" ? "lite" : "max",
    anime: settings.playerAnime4k ? "on" : null,
    playerLayout: null,
    theme: settings.theme.preset === "cool-grey" && settings.theme.fontPair === "sentient-switzer" ? null : "•",
    webhooks: webhookActive ? "live" : null,
    hotkeys: null,
    bug: null,
    advanced: null,
  };

  const renderItem = ({ id, label, Icon }: NavItem) => {
    const isActive = id === active;
    const chip = status[id];
    const debridChipLocal = id === "streaming" && debridKeys > 0 ? `${debridKeys}D` : null;
    return (
      <button
        key={id}
        onClick={() => {
          onChange(id);
          setQuery("");
        }}
        className={`group flex h-14 w-full items-center gap-3 rounded-xl px-2.5 text-start transition-colors ${
          isActive
            ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]"
            : "text-ink-muted hover:bg-elevated/70 hover:text-ink"
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            isActive
              ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--color-edge-soft)]"
              : "bg-canvas/60 text-ink-subtle group-hover:text-ink-muted"
          }`}
        >
          <Icon size={20} strokeWidth={1.6} />
        </span>
        <span className="flex-1 truncate text-[14.5px] font-medium">{t(label)}</span>
        {(chip || debridChipLocal) && (
          <span className="flex shrink-0 gap-1">
            {debridChipLocal && (
              <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent">
                {debridChipLocal}
              </span>
            )}
            {chip && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${
                  chip === "live" || chip === "via relay"
                    ? "bg-accent/15 text-accent"
                    : "bg-canvas/70 text-ink-subtle"
                }`}
              >
                {chip}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className="relative flex w-72 shrink-0 flex-col bg-surface pt-24 shadow-[1px_0_0_var(--color-edge)]">
      <div data-tauri-drag-region className="h-3 shrink-0" />
      {showBack && (
        <div className="px-3 pb-1.5">
          <button
            type="button"
            onClick={() => (canGoBack ? goBack() : setView("home"))}
            className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-[13.5px] font-semibold text-ink-muted transition-colors hover:bg-elevated/70 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="dir-icon">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            {t("Back")}
          </button>
        </div>
      )}
      <div className="px-3 pb-3">
        <div className="flex h-10 items-center gap-2 rounded-xl bg-elevated/70 px-3 shadow-[inset_0_0_0_1px_var(--color-edge-soft)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-subtle">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search settings")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (matches && matches.length > 0) {
                  onChange(matches[0].id);
                  setQuery("");
                } else if (optionMatches && optionMatches.length > 0) {
                  const o = optionMatches[0];
                  onChange(o.section, o.anchorTitle ? settingsAnchor(o.anchorTitle) : undefined);
                  setQuery("");
                }
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 text-ink-subtle transition-colors hover:text-ink"
              aria-label={t("Clear")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-8">
        {matches && (
          <div className="flex flex-col gap-1">
            {matches.length === 0 && (!optionMatches || optionMatches.length === 0) && (
              <div className="px-3.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-subtle/80">
                {t("No matches")}
              </div>
            )}
            {matches.length > 0 && (
              <>
                <div className="px-3.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-subtle/80">
                  {matches.length === 1 ? t("{n} tab", { n: matches.length }) : t("{n} tabs", { n: matches.length })}
                </div>
                {matches.map(renderItem)}
              </>
            )}
            {optionMatches && optionMatches.length > 0 && (
              <>
                <div className="px-3.5 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-subtle/80">
                  {optionMatches.length === 1 ? t("{n} option", { n: optionMatches.length }) : t("{n} options", { n: optionMatches.length })}
                </div>
                {optionMatches.map((o) => (
                  <button
                    key={`${o.section}-${o.label}`}
                    onClick={() => {
                      onChange(o.section, o.anchorTitle ? settingsAnchor(o.anchorTitle) : undefined);
                      setQuery("");
                    }}
                    className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start text-ink-muted transition-colors hover:bg-elevated/70 hover:text-ink"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas/60 text-ink-subtle group-hover:text-ink-muted">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{t(o.label)}</span>
                      <span className="block truncate text-[11px] text-ink-subtle">
                        {t(sectionLabel.get(o.section) ?? o.section)}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {!matches && NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.heading && (
              <div className="px-3.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-subtle/80">
                {t(group.heading)}
              </div>
            )}
            {group.items.map(({ id, label, Icon }) => {
              const isActive = id === active;
              const chip = status[id];
              const debridChip = id === "streaming" && debridKeys > 0 ? `${debridKeys}D` : null;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onChange(id);
                    markSectionSeen(id);
                  }}
                  className={`group flex h-14 w-full items-center gap-3 rounded-xl px-2.5 text-start transition-colors ${
                    isActive
                      ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]"
                      : "text-ink-muted hover:bg-elevated/70 hover:text-ink"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      isActive
                        ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--color-edge-soft)]"
                        : "bg-canvas/60 text-ink-subtle group-hover:text-ink-muted"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.6} />
                  </span>
                  <span className="flex-1 truncate text-[14.5px] font-medium">{t(label)}</span>
                  {isNew(id) && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-accent ring-1 ring-accent/30">
                      <span className="h-1 w-1 rounded-full bg-accent" />
                      {t("New")}
                    </span>
                  )}
                  {(chip || debridChip) && (
                    <span className="flex shrink-0 gap-1">
                      {debridChip && (
                        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent">
                          {debridChip}
                        </span>
                      )}
                      {chip && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${
                            chip === "live" || chip === "via relay"
                              ? "bg-accent/15 text-accent"
                              : "bg-canvas/70 text-ink-subtle"
                          }`}
                        >
                          {chip}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
