import {
  torrentioConfigFor,
  type Addon,
  type DebridKeySet,
} from "@/lib/addons";

const OFFICIAL_LITE_ADDONS: readonly Addon[] = [
  {
    transportUrl: "https://v3-cinemeta.strem.io/manifest.json",
    manifest: {
      id: "com.linvo.cinemeta",
      name: "Cinemeta",
      version: "3.0.14",
      resources: ["catalog", "meta", "addon_catalog"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    },
  },
  {
    transportUrl: "https://watchhub.strem.io/manifest.json",
    manifest: {
      id: "org.stremio.watchhub",
      name: "WatchHub",
      version: "1.15.0",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    },
  },
  {
    transportUrl: "https://opensubtitles-v3.strem.io/manifest.json",
    manifest: {
      id: "org.stremio.opensubtitlesv3",
      name: "OpenSubtitles v3",
      version: "1.0.0",
      resources: ["subtitles"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    },
  },
];

const WEBSTREAMR_BASE = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";
const WEBSTREAMR_LANGS: Readonly<Record<string, string>> = {
  en: "en",
  english: "en",
  anglais: "en",
  fr: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  es: "es",
  spanish: "es",
  espagnol: "es",
  de: "de",
  german: "de",
  allemand: "de",
  it: "it",
  italian: "it",
  italien: "it",
};

export function liteHttpStreamTransportUrl(preferredLanguages: string[] = []): string {
  // English and French make the zero-configuration pack useful immediately;
  // explicit preferences add supported languages without removing that fallback.
  const languages = new Set(["en", "fr"]);
  for (const language of preferredLanguages) {
    const normalized = language.trim().toLocaleLowerCase("en");
    const code = WEBSTREAMR_LANGS[normalized];
    if (code) languages.add(code);
  }
  const config = Object.fromEntries([
    ["multi", "on"],
    ...[...languages].sort().map((language) => [language, "on"]),
  ]);
  return `${WEBSTREAMR_BASE}/${encodeURIComponent(JSON.stringify(config))}/manifest.json`;
}

function liteHttpStreamAddon(preferredLanguages: string[]): Addon {
  return {
    transportUrl: liteHttpStreamTransportUrl(preferredLanguages),
    manifest: {
      id: "webstreamr-mbg",
      name: "WebStreamrMBG",
      version: "0.73.2",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt", "tmdb:"],
    },
  };
}

export function hasLiteDebridCredential(keys: DebridKeySet): boolean {
  return Object.values(keys).some((value) => typeof value === "string" && value.trim().length > 0);
}

export function liteStarterAddons(
  keys: DebridKeySet,
  preferredLanguages: string[] = [],
): Addon[] {
  const addons = OFFICIAL_LITE_ADDONS.map((addon) => ({
    ...addon,
    manifest: { ...addon.manifest },
  }));
  addons.push(liteHttpStreamAddon(preferredLanguages));
  if (!hasLiteDebridCredential(keys)) return addons;

  const config = torrentioConfigFor(keys, preferredLanguages);
  addons.push({
    transportUrl: `https://torrentio.strem.fun/${config}/manifest.json`,
    manifest: {
      id: "com.stremio.torrentio.addon",
      name: "Torrentio",
      logo: "https://torrentio.strem.fun/images/logo_v1.png",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt", "kitsu"],
    },
  });
  return addons;
}

export function mergeLiteStarterAddons(
  existing: Addon[],
  keys: DebridKeySet,
  preferredLanguages: string[] = [],
): Addon[] {
  const merged = existing.slice();
  const ids = new Set(existing.map((addon) => addon.manifest.id));
  const urls = new Set(existing.map((addon) => addon.transportUrl));

  for (const addon of liteStarterAddons(keys, preferredLanguages)) {
    if (ids.has(addon.manifest.id) || urls.has(addon.transportUrl)) continue;
    merged.push(addon);
    ids.add(addon.manifest.id);
    urls.add(addon.transportUrl);
  }
  return merged;
}
