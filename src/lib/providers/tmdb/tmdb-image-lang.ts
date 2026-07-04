import { loadStoredSettings } from "@/lib/settings/load";
import { normalizeLang } from "@/lib/subtitles/language";
import { tmdbLanguageIso } from "./tmdb-client";

// User-ordered image-language priority. null = "Original" (TMDB no-language art).
// Reads settings.tmdbImageLangs (display names) and maps to TMDB ISO codes.
// Falls back to English then Original when the list is empty.
export function imageLangPriority(): (string | null)[] {
  const names = loadStoredSettings().tmdbImageLangs ?? [];
  const out: (string | null)[] = [];
  for (const name of names) {
    if (/^original$/i.test(name.trim())) {
      if (!out.includes(null)) out.push(null);
      continue;
    }
    const code = normalizeLang(name);
    if (code && !out.includes(code)) out.push(code);
  }
  return out.length ? out : ["en", null];
}

// The effective per-title fallback order: the user's picked languages first, then
// the title's own original language, then textless art as the final fallback.
// ("Original" in the user's list just pins those fallbacks earlier.) This is why a
// logo/poster always appears when one exists in any form, instead of bare text.
function effectiveOrder(originalLang?: string | null): (string | null)[] {
  const orig = originalLang
    ? (normalizeLang(originalLang) || originalLang).toLowerCase()
    : null;
  const order: (string | null)[] = [];
  const add = (c: string | null) => {
    if (!order.includes(c)) order.push(c);
  };
  for (const c of imageLangPriority()) {
    if (c === null) {
      if (orig) add(orig);
      add(null);
    } else add(c);
  }
  if (orig) add(orig);
  add(null);
  return order;
}

// Comma-separated value for TMDB's include_image_language param, e.g. "ar,en,ja,null".
export function imageLangParam(originalLang?: string | null): string {
  return effectiveOrder(originalLang)
    .map((c) => c ?? "null")
    .join(",");
}

// Rank an image's language against the effective order. Higher is better.
// -1 means the language is outside the order (still selectable as an absolute last resort).
export function imageLangRank(iso: string | null | undefined, originalLang?: string | null): number {
  const order = effectiveOrder(originalLang);
  const idx = order.indexOf(iso ?? null);
  return idx === -1 ? -1 : order.length - idx;
}

// Whether per-card poster enrichment is worthwhile. TMDB's list endpoints return
// poster_path in the bulk request `language` (the metadata language, or English when
// unset), so the catalog poster follows the TEXT language. We enrich per-card only
// when the user's top image preference differs from that bulk poster language — this
// is what keeps posters independent of the metadata language (e.g. Arabic text but
// English posters). "Original" first always needs a per-title fetch.
export function shouldLocalizePosters(): boolean {
  const [first] = imageLangPriority();
  const bulk = tmdbLanguageIso() || "en";
  if (first == null) return true;
  return first !== bulk;
}
