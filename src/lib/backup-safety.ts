/** Portable data is selected by schema. Unknown stores/fields never cross the boundary. */
type Rule = (value: unknown) => unknown | undefined;
type Schema = Record<string, Rule>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const number: Rule = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const boolean: Rule = (value) => typeof value === "boolean" ? value : undefined;
const text: Rule = (value) => typeof value === "string" && value.length <= 1000 && !/(?:[a-z][a-z\d+.-]*:\/\/|data:|magnet:|bearer\s)/i.test(value) ? value : undefined;
const id: Rule = (value) => typeof value === "string" && /^[\w:|.%-]+$/.test(value) && value.length <= 512 && !/%(?:2f|3a|40)/i.test(value) ? value : undefined;
const localPath: Rule = (value) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[?\x00]/.test(value) ? value : undefined;
const choice = (...values: unknown[]): Rule => (value) => values.includes(value) ? value : undefined;
const nullable = (rule: Rule): Rule => (value) => value === null ? null : rule(value);
const list = (rule: Rule): Rule => (value) => Array.isArray(value) ? value.map(rule).filter((item) => item !== undefined) : undefined;
const object = (schema: Schema, required: string[] = []): Rule => (value) => {
  if (!record(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(schema)) {
    const cleaned = rule(value[key]);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return required.every((key) => Object.hasOwn(result, key)) ? result : undefined;
};
const dictionary = (rule: Rule): Rule => (value) => {
  if (!record(value)) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (id(key) === undefined || /^(?:__proto__|constructor|prototype)$/.test(key)) continue;
    const cleaned = rule(item);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
};

// Deliberately explicit: adding a product setting does not silently make it exportable.
const booleanPreferences = [
  "blurComments", "blurEpisodes", "requirePreferredLanguage", "showImdbBadge", "showTmdbBadge", "showRtBadge", "showMalBadge",
  "showMetacriticBadge", "showLetterboxdBadge", "showMdblistBadge", "showTraktBadge", "showDetailRatings", "showImdbDetail",
  "showTmdbDetail", "showMalDetail", "showRtDetail", "showRtAudienceDetail", "showLetterboxdDetail", "showMetacriticDetail",
  "showTraktDetail", "showMdblistDetail", "showTraktComments", "showSimklBadge", "showDubBadge", "showQualityBadge", "showCardBadges",
  "detailTrailerAutoplay", "heroBackdropCarousel", "detailTrailerAudio", "heroFull", "heroFullQuality", "resumePrompt", "resumePlayback",
  "keepFullscreenOnExit", "fullscreenRestorePosition", "contentAdvisoryToast", "playerVolumeHud", "playerTitleSeriesFirst",
  "showWatchedButton", "showEpisodeRating", "showEpisodeDescription", "hdEpisodeImages", "episodeArcGroups", "showAdultAddons",
  "playerMenuBlack", "seekPreviewEnabled", "instantPlay", "seasonSourceLock", "rememberLastStream", "keepSourceNextEpisode",
  "playerHdrToSdr", "playerMacEdr", "playerMotionInterp", "playerAnime4k", "playerAnime4kAnimeOnly", "playerAnime4kIndicator",
  "playerMpvEmbed", "playerP2pChip", "showQualityInfo", "castAlwaysTranscode", "subBold", "subShowInPip", "subtitleAutoSync",
  "subtitlesOffByDefault", "preferEmbeddedSubs", "subtitleAutoUpgrade", "subtitlePreselect", "autoSkipIntro", "autoSkipRecap",
  "autoSkipOutro", "autoSkipAd", "showSkipButton", "forcedSubsWhenNativeAudio", "showLocalLibraryBadge", "hidePosterTitles",
  "hoverPreviewEnabled", "playerConfirmLeave", "playerEscExitsFullscreen", "audioNormalize", "autoPlayNextEpisode",
  "keyboardPauseShowsControls", "hideWatchedInCatalogs", "hideUnreleased", "localEpisodeSortDesc", "showPlaylistsTab",
  "hideSpoilers", "spoilerHideThumbnails", "spoilerHideTitles", "spoilerHideDescriptions", "spoilerSkipNext", "streamBackdropBlur",
  "homeShowAllAddonRows", "libraryBookmarkedOnly", "animeOnlyInAnimeRoom", "cwAdvanceNext", "useNativeTitleBar", "closeToTray",
  "trayAlwaysOnTop", "pauseMinimized", "pauseUnfocused", "cwSnapshotFullQuality", "blockTrackers", "animeHideWatchedPicks",
  "fullStreamDescription", "pickerShowFilename", "pickerRefreshNextToBack", "seekBarFill", "weekStartsMonday", "downloadCreateFolders",
  "sidebarCollapsed", "translateTitles", "translateDescriptions", "feedLocaleBias", "adSkipEnabled", "adReportAlwaysShow", "adReportFirstSeen",
] as const;
const numberPreferences = [
  "cardBadgeLimit", "posterScale", "posterRadius", "rowTitleScale", "playerTitleScale", "uiScale", "heroShadow", "subFontSize",
  "subBorderSize", "subMarginY", "subBoxOpacity", "subOpacity", "subLineSpacing", "skipButtonHideSec", "seekBackStepSec",
  "seekForwardStepSec", "bandwidthMbps", "nextEpisodeLeadSec", "cwSnapshotRetentionDays", "seekBarHeight", "seekBarFillOpacity", "seekDotSize",
] as const;
const textPreferences = [
  "soundTheme", "region", "animeCardRating", "posterEffect", "trailerQuality", "playerVolumeHudPosition", "badgePlacement",
  "watchlistBadge", "episodeLayout", "episodeSort", "episodeOrderProvider", "tvdbSeasonType", "playerEngine", "playerShellId",
  "playerChromeTheme", "playerDisplayPanel", "playerAnime4kMode", "playerAnime4kTier", "playerAnime4kOverride", "subFontColor",
  "subBorderColor", "subAlignX", "subAssOverride", "subStyle", "subFontFamily", "subBoxColor", "tmdbLanguage", "nfoPosterSize",
  "nfoBackdropSize", "nfoLogoSize", "localPlaybackMode", "hoverPreviewPlacement", "cardHoverStyle", "mpvQuality", "mpvHwdec",
  "playerHdrStage", "audioProfile", "songCardStyle", "homeMode", "librarySort", "streamFilterLevel", "pickerLayout", "streamSort",
  "seekBarStyle", "seekBarColor", "seekDotShape", "uiLanguage", "cropMode", "harborColor",
] as const;
const textListPreferences = ["preferredLanguages", "homeLanguages", "preferredSubLangs", "preferredAudioLangs", "tmdbImageLangs", "trackBlockWords", "animeExcludeOrigins", "macPinnedViews"] as const;
const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{3,8}$/i.test(value) ? value : undefined;
const settingsSchema: Schema = {
  ...Object.fromEntries(booleanPreferences.map((key) => [key, boolean])),
  ...Object.fromEntries(numberPreferences.map((key) => [key, number])),
  ...Object.fromEntries(textPreferences.map((key) => [key, text])),
  ...Object.fromEntries(textListPreferences.map((key) => [key, list(text)])),
  customPlaybackSpeeds: list(number), customSleepMinutes: list(number), animeFavoriteGenres: list(number),
  hideContent: object({ anime: boolean, liveTv: boolean, sports: boolean, adult: boolean }),
  subProvidersEnabled: object({ wyzie: boolean, opensubtitles: boolean, jimaku: boolean, addons: boolean }),
  homeRows: object({ order: list(id), hidden: list(id), renamed: dictionary(text), numerals: list(id) }),
  navCustomization: object({ order: list(id), hidden: list(id), renamed: dictionary(text) }),
  theme: object({
    preset: text, fontPair: text, fontPairOverride: boolean, backgroundDim: number,
    customColors: nullable(object(Object.fromEntries(["canvas", "surface", "elevated", "raised", "ink", "inkMuted", "inkSubtle", "edge", "accent", "danger"].map((key) => [key, color])))),
  }),
};

const media = object({ id, type: choice("movie", "series"), name: text, addedAt: number }, ["id", "type", "name", "addedAt"]);
const libraryEntry = object({
  id, path: localPath, filename: text, title: text, year: nullable(number), type: choice("movie", "show"), resolution: nullable(text),
  rating: nullable(number), runtime: nullable(number), tmdbId: nullable(number), imdbId: nullable(id), season: nullable(number),
  episode: nullable(number), addedAt: number, needsReview: boolean, source: choice("tmdb", "nfo"),
}, ["id", "path", "filename", "title", "type", "addedAt"]);
const episode = object({ season: number, episode: number, canonicalVideoId: id }, ["season", "episode"]);
const lumaRef = object({ kind: choice("catalog", "local-library"), metaId: id, entryId: id, mediaType: choice("movie", "series"), episode }, ["kind", "mediaType"]);
const presentation = object({ title: text, episodeTitle: text }, ["title"]);
const lumaItem = { id, ref: lumaRef, presentation };
const luma = object({
  schemaVersion: choice(1), revision: number, updatedAt: number, profileId: id,
  queue: list(object({ ...lumaItem, addedAt: number }, ["id", "ref", "presentation", "addedAt"])),
  resumes: list(object({ ...lumaItem, positionMs: number, durationMs: number, updatedAt: number }, ["id", "ref", "presentation", "positionMs", "durationMs", "updatedAt"])),
  preferences: object({ autoAdvance: boolean, rememberActivity: boolean }),
  migration: object({ legacyQueueImported: boolean, legacyResumeImported: boolean, completedAt: number }),
}, ["schemaVersion", "profileId", "queue", "resumes"]);
const localCw = object({ id, type: choice("movie", "series"), name: text, season: number, episode: number, videoId: id, positionMs: number, durationMs: number, t: number }, ["id", "type", "name", "positionMs", "durationMs", "t"]);
const activitySchemas: Record<string, Rule> = {
  "harbor.watchlist.v1": list((value) => typeof value === "string" ? id(value) : media(value)),
  "harbor.library.local.v1": list(libraryEntry),
  "harbor.resume": dictionary(object({ ms: number, t: number }, ["ms", "t"])),
  "harbor.localcw.v1": dictionary(localCw),
  "harbor.moviewatched.v1": list(id), "harbor.watchedFlag.v1": list(id),
  "harbor.manualwatched.v1": list(id), "harbor.manualunwatched.v1": list(id), "harbor.manualwatched.dismissed.v1": list(id),
  "harbor.manualwatched.meta.v1": dictionary(object({ type: choice("series"), name: text, markedAt: text }, ["type", "name"])),
};

export function isBackupSettingsKey(key: string): boolean {
  return /^harbor\.settings(?:\.[\w-]+)?$/.test(key);
}
export function isBackupActivityKey(key: string): boolean {
  return Object.hasOwn(activitySchemas, key) || /^harbor\.(?:localwatchlist|favorites)\.v1\.[\w-]+$/.test(key) || /^vayra\.luma\.v1\.[\w%-]+(?:\.last-good)?$/.test(key);
}
export function sanitizeBackupEntry(key: string, raw: string, includeActivity: boolean): string | undefined {
  let rule: Rule | undefined;
  if (isBackupSettingsKey(key)) rule = object(settingsSchema);
  else if (includeActivity && isBackupActivityKey(key)) {
    rule = key.startsWith("vayra.luma.") ? luma : activitySchemas[key] ?? list((value) => typeof value === "string" ? id(value) : media(value));
  }
  if (!rule) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return undefined; }
  const cleaned = rule(parsed);
  return cleaned === undefined ? undefined : JSON.stringify(cleaned);
}

/** Safe patches never replace locally held credentials, links or unknown fields. */
export function mergeBackupSettings(current: string | null, incoming: string): string {
  let previous: unknown = {};
  if (current !== null) {
    previous = JSON.parse(current);
    if (!record(previous)) throw new Error("Invalid current preferences");
  }
  const merge = (before: unknown, patch: Record<string, unknown>): Record<string, unknown> => {
    const result = record(before) ? { ...before } : {};
    for (const [key, value] of Object.entries(patch)) result[key] = record(value) ? merge(result[key], value) : value;
    return result;
  };
  return JSON.stringify(merge(previous, JSON.parse(incoming) as Record<string, unknown>));
}

export function portableBackground(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value) ? value : undefined;
}
