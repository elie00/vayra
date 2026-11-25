import type { ScoredStream } from "@/lib/streams/types";
import { anyStreamCached, formatSize } from "./picker-utils";

export type AddonErrorItem = {
  stream: ScoredStream;
  addonName: string;
  message: string;
};

export type ExternalLinkItem = {
  stream: ScoredStream;
  addonName: string;
  label: string;
  url: string;
};

export type ClassifiedStreams = {
  playable: ScoredStream[];
  errors: AddonErrorItem[];
  external: ExternalLinkItem[];
};

export type BestPlayablePick = {
  best: ScoredStream | null;
  rest: ScoredStream[];
};

export type QualityBucketKey = "4K" | "1080p" | "720p" | "other";

export type QualityGroup = {
  key: QualityBucketKey;
  streams: ScoredStream[];
};

export type FormattedStreamLanguages = {
  primary: string[];
  overflowCount: number;
  all: string[];
  matchesPreferred: boolean;
};

export type SeederHealth = "good" | "ok" | "low";

export type ReleaseMeta = {
  releaseName: string;
  sourceLabel: string;
  indexer: string | null;
  sizeLabel: string | null;
  seeders: number | null;
  seederHealth: SeederHealth | null;
  isCached: boolean;
};

const EXPLICIT_ERROR_PATTERNS: RegExp[] = [
  /(?:⚠️|❌|🚫)\s*(?:error|err|warning|invalid|failed|expired|unauthorized)/iu,
  /\bERROR\s*!/,
  /\binvalid\s+(?:user\s+)?(?:api\s*key|token|credentials?|auth(?:entication)?|config(?:uration)?)\b/i,
  /\b(?:api\s*key|token|subscription|account|session|license)\s+(?:is\s+)?(?:invalid|expired|missing|required|revoked)\b/i,
  /\b(?:addon|service|debrid|account)\s+(?:is\s+)?not\s+configured\b/i,
  /\bnot\s+configured\b/i,
  /\bplease\s+(?:re-?)?configure\b/i,
  /\bconfiguration\s+(?:required|error|invalid|missing)\b/i,
  /\bfailed\s+to\s+(?:fetch|load|resolve|authenticate|connect|retrieve|authorize)\b/i,
  /\b(?:authentication\s+failed|quota\s+exceeded|rate\s+limit(?:ed)?|limit\s+reached)\b/i,
  /\bno\s+active\s+(?:debrid|premium|subscription)\b/i,
];

function hasPlayableSource(stream: ScoredStream): boolean {
  return Boolean(
    stream.url?.trim() ||
    stream.infoHash?.trim() ||
    stream.ytId?.trim(),
  );
}

function hasRealMediaMetrics(stream: ScoredStream): boolean {
  const hasSize = stream.size != null && stream.size > 0;
  const hasSeeders = stream.seeders != null && stream.seeders > 0;
  return hasSize || hasSeeders;
}

function isAddonErrorStream(stream: ScoredStream): boolean {
  // Real torrents with an infoHash and media metrics are never addon error notices.
  if (stream.infoHash?.trim() && hasRealMediaMetrics(stream)) return false;

  const text = [stream.name, stream.title, stream.description].filter(Boolean).join("\n");
  if (!text.trim()) return false;

  // Streams with real positive file size or seeder count are real media unless
  // there is no playable source at all.
  if (hasPlayableSource(stream) && hasRealMediaMetrics(stream)) return false;

  return EXPLICIT_ERROR_PATTERNS.some((rx) => rx.test(text));
}

function extractErrorMessage(stream: ScoredStream, addonName: string): string {
  const rawLines = [stream.name, stream.title, stream.description]
    .filter((part): part is string => Boolean(part?.trim()))
    .flatMap((part) => part.split(/\r?\n/))
    .map((line) => line.replace(/^[⚠️❌🚫\s]+/u, "").trim())
    .filter((line) => line.length > 0);

  const addonLower = addonName.trim().toLowerCase();
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of rawLines) {
    const lower = line.toLowerCase();
    if (lower === addonLower) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    deduped.push(line);
  }

  return deduped.join(" — ") || addonName;
}

function extractExternalLabel(stream: ScoredStream, addonName: string): string {
  const candidates = [stream.title, stream.description, stream.name];
  for (const raw of candidates) {
    if (!raw) continue;
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) return firstLine;
  }
  return addonName;
}

/**
 * Partitions streams into playable video sources, addon error notices,
 * and external-only web links while preserving input order within each group.
 */
export function classifyStreams(streams: ScoredStream[]): ClassifiedStreams {
  const playable: ScoredStream[] = [];
  const errors: AddonErrorItem[] = [];
  const external: ExternalLinkItem[] = [];

  for (const stream of streams) {
    const addonName = stream.addonName?.trim() || stream.addonId || "Addon";

    if (isAddonErrorStream(stream)) {
      errors.push({
        stream,
        addonName,
        message: extractErrorMessage(stream, addonName),
      });
      continue;
    }

    if (hasPlayableSource(stream)) {
      playable.push(stream);
      continue;
    }

    const externalUrl = stream.externalUrl?.trim();
    if (externalUrl) {
      external.push({
        stream,
        addonName,
        label: extractExternalLabel(stream, addonName),
        url: externalUrl,
      });
      continue;
    }

    // Unplayable entry with neither media source nor externalUrl: surface as error if it carries text.
    const fallbackMsg = extractErrorMessage(stream, addonName);
    if (fallbackMsg && fallbackMsg !== addonName) {
      errors.push({
        stream,
        addonName,
        message: fallbackMsg,
      });
    }
  }

  return { playable, errors, external };
}

/**
 * Splits an already-ranked playable list into the top pick and the remaining streams.
 */
export function pickBestPlayable(playable: ScoredStream[]): BestPlayablePick {
  if (playable.length === 0) return { best: null, rest: [] };
  return { best: playable[0], rest: playable.slice(1) };
}

const QUALITY_BUCKET_ORDER: readonly QualityBucketKey[] = ["4K", "1080p", "720p", "other"];

function resolutionToBucket(resolution: string | undefined): QualityBucketKey {
  if (!resolution) return "other";
  const norm = resolution.trim().toLowerCase();
  if (norm === "4k" || norm === "2160p" || norm === "uhd") return "4K";
  if (norm === "1080p") return "1080p";
  if (norm === "720p") return "720p";
  return "other";
}

/**
 * Groups playable streams into ordered quality buckets (`4K`, `1080p`, `720p`, `other`),
 * omitting empty buckets and preserving stream order within each bucket.
 */
export function groupPlayableByQuality(streams: ScoredStream[]): QualityGroup[] {
  const buckets: Record<QualityBucketKey, ScoredStream[]> = {
    "4K": [],
    "1080p": [],
    "720p": [],
    other: [],
  };

  for (const stream of streams) {
    buckets[resolutionToBucket(stream.resolution)].push(stream);
  }

  return QUALITY_BUCKET_ORDER
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, streams: buckets[key] }));
}

const LANGUAGE_TO_ISO: Record<string, string> = {
  // English
  en: "EN", eng: "EN", english: "EN",
  // French
  fr: "FR", fre: "FR", fra: "FR", french: "FR", vff: "FR", vfq: "FR", vostfr: "FR",
  // Spanish
  es: "ES", spa: "ES", esp: "ES", spanish: "ES", "spanish (latin america)": "ES", lat: "ES", latino: "ES", latam: "ES", castellano: "ES",
  // German
  de: "DE", deu: "DE", ger: "DE", german: "DE",
  // Italian
  it: "IT", ita: "IT", italian: "IT",
  // Portuguese
  pt: "PT", por: "PT", portuguese: "PT", ptbr: "PT", dublado: "PT",
  // Japanese
  ja: "JA", jp: "JA", jpn: "JA", jap: "JA", japanese: "JA",
  // Korean
  ko: "KO", kor: "KO", kr: "KO", korean: "KO",
  // Chinese
  zh: "ZH", zho: "ZH", chi: "ZH", chn: "ZH", cn: "ZH", chinese: "ZH", mandarin: "ZH", cantonese: "ZH",
  // Russian
  ru: "RU", rus: "RU", russian: "RU",
  // Hindi / Indian languages
  hi: "HI", hin: "HI", hindi: "HI",
  ta: "TA", tam: "TA", tamil: "TA",
  te: "TE", tel: "TE", telugu: "TE",
  // Arabic
  ar: "AR", ara: "AR", arabic: "AR",
  // Turkish
  tr: "TR", tur: "TR", turkish: "TR",
  // Dutch
  nl: "NL", nld: "NL", dut: "NL", dutch: "NL",
  // Polish
  pl: "PL", pol: "PL", polish: "PL",
  // Romanian
  ro: "RO", ron: "RO", rom: "RO", romanian: "RO",
  // Nordic
  sv: "SV", swe: "SV", swedish: "SV",
  no: "NO", nor: "NO", nb: "NO", nn: "NO", norwegian: "NO",
  da: "DA", dan: "DA", danish: "DA",
  fi: "FI", fin: "FI", finnish: "FI",
  is: "IS", isl: "IS", ice: "IS", icelandic: "IS",
  // Central / Eastern European
  cs: "CS", ces: "CS", cze: "CS", czech: "CS",
  hu: "HU", hun: "HU", hungarian: "HU",
  uk: "UK", ukr: "UK", ukrainian: "UK",
  bg: "BG", bul: "BG", bulgarian: "BG",
  hr: "HR", hrv: "HR", croatian: "HR",
  sk: "SK", slk: "SK", slo: "SK", slovak: "SK",
  sl: "SL", slv: "SL", slovenian: "SL",
  sr: "SR", srp: "SR", serbian: "SR",
  et: "ET", est: "ET", estonian: "ET",
  lv: "LV", lav: "LV", latvian: "LV",
  lt: "LT", lit: "LT", lithuanian: "LT",
  // Mediterranean & Middle East
  el: "EL", ell: "EL", gre: "EL", gr: "EL", greek: "EL",
  he: "HE", heb: "HE", iw: "HE", hebrew: "HE",
  fa: "FA", fas: "FA", per: "FA", persian: "FA", farsi: "FA",
  // Southeast Asia
  th: "TH", tha: "TH", thai: "TH",
  vi: "VI", vie: "VI", vietnamese: "VI",
  id: "ID", ind: "ID", indonesian: "ID",
  ms: "MS", msa: "MS", may: "MS", malay: "MS",
  tl: "TL", tgl: "TL", tagalog: "TL", fil: "TL", filipino: "TL",
};

const FLAG_COUNTRY_TO_ISO: Record<string, string> = {
  US: "EN", GB: "EN", UK: "EN", CA: "EN", AU: "EN", NZ: "EN", IE: "EN",
  FR: "FR", BE: "FR", LU: "FR",
  ES: "ES", MX: "ES", AR: "ES", CO: "ES", PE: "ES", CL: "ES", VE: "ES", UY: "ES",
  DE: "DE", AT: "DE", CH: "DE",
  IT: "IT",
  PT: "PT", BR: "PT",
  JP: "JA",
  KR: "KO", KP: "KO",
  CN: "ZH", HK: "ZH", TW: "ZH", SG: "ZH",
  RU: "RU", BY: "RU",
  IN: "HI", PK: "HI",
  SA: "AR", AE: "AR", EG: "AR", IQ: "AR", JO: "AR", KW: "AR", LB: "AR", MA: "AR", QA: "AR", SY: "AR", TN: "AR",
  TR: "TR",
  NL: "NL",
  PL: "PL",
  RO: "RO", MD: "RO",
  SE: "SV",
  NO: "NO",
  DK: "DA",
  FI: "FI",
  IS: "IS",
  CZ: "CS",
  HU: "HU",
  UA: "UK",
  BG: "BG",
  HR: "HR",
  SK: "SK",
  SI: "SL",
  RS: "SR",
  EE: "ET",
  LV: "LV",
  LT: "LT",
  GR: "EL",
  IL: "HE",
  IR: "FA",
  TH: "TH",
  VN: "VI",
  ID: "ID",
  MY: "MS",
  PH: "TL",
};

const FLAG_EMOJI_RX = /[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/gu;
const ASCII_ALPHA_RX = /^[A-Z]{2,3}$/;

export function normalizeLanguageToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject raw flag emojis directly; callers use extractFlagsToIso for those.
  if (FLAG_EMOJI_RX.test(trimmed)) {
    FLAG_EMOJI_RX.lastIndex = 0;
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "multi" || lower === "dual") return null;

  if (LANGUAGE_TO_ISO[lower]) return LANGUAGE_TO_ISO[lower];

  // Handle locale tags like "fr-FR", "en_US", "pt-BR"
  const baseTag = lower.split(/[-_]/)[0];
  if (baseTag && LANGUAGE_TO_ISO[baseTag]) return LANGUAGE_TO_ISO[baseTag];

  // Fallback for already-short ASCII ISO codes not in our map
  const upper = baseTag.toUpperCase();
  if (ASCII_ALPHA_RX.test(upper)) return upper.slice(0, 2);

  return null;
}

function extractFlagIsoCodes(text: string): string[] {
  const out: string[] = [];
  const matches = text.match(FLAG_EMOJI_RX) ?? [];
  for (const flag of matches) {
    const a = flag.codePointAt(0);
    const b = flag.codePointAt(2);
    if (a == null || b == null) continue;
    const country =
      String.fromCharCode(a - 0x1f1e6 + 65) + String.fromCharCode(b - 0x1f1e6 + 65);
    const iso = FLAG_COUNTRY_TO_ISO[country];
    if (iso) out.push(iso);
  }
  return out;
}

/**
 * Formats a stream's audio languages into deduplicated uppercase ISO codes
 * (never raw flag emojis), prioritizing the user's preferred languages first.
 */
export function formatStreamLanguages(
  stream: ScoredStream,
  preferredLanguages: string[] = [],
  maxPrimary = 2,
): FormattedStreamLanguages {
  const seen = new Set<string>();
  const collected: string[] = [];

  const pushCode = (code: string | null) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    collected.push(code);
  };

  for (const lang of stream.audioLanguages ?? []) {
    pushCode(normalizeLanguageToIso(lang));
  }

  // Supplement from flag emojis in title/description so multi-flag Torrentio
  // streams with languages beyond the base parser (or unparsed streams) are covered.
  const rawText = `${stream.title ?? ""}\n${stream.description ?? ""}`;
  if (rawText.trim()) {
    for (const code of extractFlagIsoCodes(rawText)) {
      pushCode(code);
    }
  }

  const preferredOrdered: string[] = [];
  const preferredSet = new Set<string>();
  for (const pref of preferredLanguages) {
    const code = normalizeLanguageToIso(pref);
    if (code && !preferredSet.has(code)) {
      preferredSet.add(code);
      preferredOrdered.push(code);
    }
  }

  const matchedPreferred = preferredOrdered.filter((code) => seen.has(code));
  const others = collected.filter((code) => !preferredSet.has(code));
  const all = [...matchedPreferred, ...others];

  const limit = Math.max(1, maxPrimary);
  const primary = all.slice(0, limit);
  const overflowCount = Math.max(0, all.length - primary.length);

  return {
    primary,
    overflowCount,
    all,
    matchesPreferred: matchedPreferred.length > 0,
  };
}

const STATS_LINE_RX = /(?:👤|👥|💾|⚙️?|🌱|🎬|🔊|📦)/u;
const INDEXER_RX = /⚙️?\s*([^\n|•·👤💾🌱🔊📦\u{1F1E6}-\u{1F1FF}]+)/u;
const FALLBACK_SIZE_RX = /(\d+(?:\.\d+)?)\s*(TB|GB|MB|TiB|GiB|MiB)\b/i;
const FALLBACK_SEEDERS_RX = /(?:👥|👤|S:|seeds?:?|\bS\s*=\s*)\s*(\d+)/i;

function isFlagOrLanguageOnlyLine(line: string): boolean {
  const withoutFlags = line.replace(FLAG_EMOJI_RX, "");
  const withoutLabels = withoutFlags.replace(/\b(?:multi|dual)\s*(?:audio|lang(?:uage)?s?)?\b/gi, "");
  const remaining = withoutLabels.replace(/[\s/|•·,\-+()[\]]+/g, "");
  return remaining.length === 0;
}

function stripInlineStats(line: string): string {
  const idx = line.search(STATS_LINE_RX);
  const sliced = idx >= 0 ? line.slice(0, idx) : line;
  return sliced
    .replace(FLAG_EMOJI_RX, "")
    .replace(/\s+/g, " ")
    .replace(/[\s/|•·-]+$/, "")
    .trim();
}

function basenameOf(path: string): string {
  const cleaned = path.trim();
  const slash = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  return slash >= 0 ? cleaned.slice(slash + 1).trim() : cleaned;
}

function extractReleaseName(stream: ScoredStream): string {
  const hintFilename = stream.behaviorHints?.filename ?? stream.behaviorHints?.fileName;
  if (hintFilename?.trim()) {
    const base = basenameOf(hintFilename);
    if (base) return base;
  }

  const rawText = [stream.title, stream.description].filter(Boolean).join("\n");
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (isFlagOrLanguageOnlyLine(line)) continue;
    // Skip pure stats lines that start with a stat emoji or become empty after stripping stats
    if (/^[👤👥💾⚙️🌱🎬🔊📦⚡]/u.test(line)) continue;
    const cleaned = stripInlineStats(line);
    if (cleaned.length > 0 && !isFlagOrLanguageOnlyLine(cleaned)) {
      return cleaned;
    }
  }

  if (stream.parsedTitle?.trim()) return stream.parsedTitle.trim();
  if (stream.name?.trim()) {
    return stream.name.split(/\r?\n/)[0].trim();
  }
  return "";
}

function extractIndexer(stream: ScoredStream): string | null {
  const rawText = `${stream.title ?? ""}\n${stream.description ?? ""}`;
  const match = rawText.match(INDEXER_RX);
  if (!match) return null;
  const candidate = match[1].trim().replace(/[•·|/\-]+$/, "").trim();
  return candidate.length > 0 ? candidate : null;
}

function parseFallbackSizeBytes(text: string): number | null {
  const m = text.match(FALLBACK_SIZE_RX);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("t")) return Math.round(n * 1024 ** 4);
  if (unit.startsWith("g")) return Math.round(n * 1024 ** 3);
  if (unit.startsWith("m")) return Math.round(n * 1024 ** 2);
  return null;
}

function computeSeederHealth(seeders: number | null): SeederHealth | null {
  if (seeders == null) return null;
  if (seeders >= 50) return "good";
  if (seeders >= 10) return "ok";
  return "low";
}

/**
 * Extracts clean presentation metadata for a stream row:
 * 1-line release name, addon/indexer source label, formatted size,
 * seeder count + health tier, and cached status.
 */
export function extractReleaseMeta(stream: ScoredStream): ReleaseMeta {
  const releaseName = extractReleaseName(stream);
  const indexer = extractIndexer(stream);
  const addonName = stream.addonName?.trim() || stream.addonId || "";

  let sourceLabel = addonName;
  if (indexer) {
    if (!addonName) {
      sourceLabel = indexer;
    } else if (addonName.toLowerCase().includes(indexer.toLowerCase())) {
      sourceLabel = addonName;
    } else {
      sourceLabel = `${addonName} · ${indexer}`;
    }
  }

  const rawText = `${stream.title ?? ""}\n${stream.description ?? ""}`;
  const sizeBytes =
    stream.size != null && stream.size > 0
      ? stream.size
      : parseFallbackSizeBytes(rawText);
  const sizeLabel = sizeBytes != null ? formatSize(sizeBytes) : null;

  let seeders: number | null =
    stream.seeders != null && Number.isFinite(stream.seeders) && stream.seeders >= 0
      ? stream.seeders
      : null;
  if (seeders == null) {
    const m = rawText.match(FALLBACK_SEEDERS_RX);
    if (m) {
      const parsed = Number(m[1]);
      if (Number.isFinite(parsed) && parsed >= 0) seeders = parsed;
    }
  }

  return {
    releaseName,
    sourceLabel,
    indexer,
    sizeLabel,
    seeders,
    seederHealth: computeSeederHealth(seeders),
    isCached: anyStreamCached(stream),
  };
}
