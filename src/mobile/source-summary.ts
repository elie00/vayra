import { localizedLanguageName } from "@/lib/i18n/language-label";
import type { ScoredStream } from "@/lib/streams/types";

// Plain-language summaries of a playback source for the phone picker: the
// quality people pick from, the picture and sound features that matter, and
// how big, how ready and from where it is — instead of a raw release name.

type T = (key: string, vars?: Record<string, string | number>) => string;

export type SourceQuality = "4K" | "1080p" | "720p" | "SD";

export const QUALITY_ORDER: SourceQuality[] = ["4K", "1080p", "720p", "SD"];

export function sourceQuality(s: ScoredStream): SourceQuality {
  if (s.resolution === "4K" || s.resolution === "1080p" || s.resolution === "720p") return s.resolution;
  return "SD";
}

const HDR_LABEL: Record<string, string> = {
  DV: "Dolby Vision",
  "DV+HDR10": "Dolby Vision",
  HDR10: "HDR10",
  "HDR10+": "HDR10+",
  HLG: "HLG",
};

// Short names that fit a phone row; Dolby Vision stays spelled out, as people know it.
const AUDIO_LABEL: Record<string, string> = {
  Atmos: "Atmos",
  TrueHD: "TrueHD",
  "DTS-HD MA": "DTS-HD",
  DTS: "DTS",
  "DD+": "DD+",
};

/** HDR, notable sound, then up to two audio languages in the UI language. */
export function sourceFeatures(s: ScoredStream, t: T, locale: string): string[] {
  const out: string[] = [];
  if (s.hdrFormat && HDR_LABEL[s.hdrFormat]) out.push(t(HDR_LABEL[s.hdrFormat]));
  if (s.audio?.codec && AUDIO_LABEL[s.audio.codec]) out.push(AUDIO_LABEL[s.audio.codec]);
  const langs = (s.audioLanguages ?? []).map((l) => (/^multi$/i.test(l) ? t("Multi") : localizedLanguageName(l, locale)));
  if (langs.length > 0) out.push(langs.slice(0, 2).join(", ") + (langs.length > 2 ? ` +${langs.length - 2}` : ""));
  return out;
}

export function isCached(s: ScoredStream): boolean {
  return Object.values(s.cached ?? {}).some(Boolean);
}

function formatSize(bytes: number, locale: string): string {
  const gb = bytes / 1024 ** 3;
  const unit = gb >= 1 ? "gigabyte" : "megabyte";
  const value = gb >= 1 ? gb : bytes / 1024 ** 2;
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: gb >= 1 ? 1 : 0 }).format(value);
}

/** Size, then cached (debrid, instant) or peers (torrent), then the addon. */
export function sourceFacts(s: ScoredStream, t: T, locale: string): string[] {
  const out: string[] = [];
  if (s.size && s.size > 0) out.push(formatSize(s.size, locale));
  if (isCached(s)) out.push(t("Cached"));
  else if (s.seeders != null && s.seeders > 0) out.push(t("{n} peers", { n: s.seeders }));
  if (s.addonName) out.push(s.addonName);
  return out;
}
