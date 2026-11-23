import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { tmdbDiscover } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { Row } from "./row";

type Lang = { iso: string; name: string; endonym: string; hue: number };

const LANGS: Lang[] = [
  { iso: "ko", name: "Korean", endonym: "한국어", hue: 24 },
  { iso: "ja", name: "Japanese", endonym: "日本語", hue: 350 },
  { iso: "es", name: "Spanish", endonym: "Español", hue: 55 },
  { iso: "fr", name: "French", endonym: "Français", hue: 255 },
  { iso: "zh", name: "Chinese", endonym: "中文", hue: 14 },
  { iso: "hi", name: "Hindi", endonym: "हिन्दी", hue: 300 },
  { iso: "de", name: "German", endonym: "Deutsch", hue: 42 },
  { iso: "it", name: "Italian", endonym: "Italiano", hue: 148 },
  { iso: "pt", name: "Portuguese", endonym: "Português", hue: 132 },
  { iso: "tr", name: "Turkish", endonym: "Türkçe", hue: 200 },
  { iso: "sv", name: "Swedish", endonym: "Svenska", hue: 228 },
  { iso: "da", name: "Danish", endonym: "Dansk", hue: 5 },
  { iso: "no", name: "Norwegian", endonym: "Norsk", hue: 245 },
  { iso: "ru", name: "Russian", endonym: "Русский", hue: 340 },
  { iso: "pl", name: "Polish", endonym: "Polski", hue: 170 },
  { iso: "th", name: "Thai", endonym: "ไทย", hue: 318 },
  { iso: "nl", name: "Dutch", endonym: "Nederlands", hue: 78 },
  { iso: "ar", name: "Arabic", endonym: "العربية", hue: 165 },
];

const langBackdropCache = new Map<string, string | null>();
const usedLangBackdrops = new Set<string>();

export function LanguageTiles() {
  const t = useT();
  return (
    <Row title={t("Browse by Language")} min={210} shape="tile" scrollKey="discover:languages" alwaysActive>
      {LANGS.map((l) => (
        <LanguageTile key={l.iso} lang={l} />
      ))}
    </Row>
  );
}

function LanguageTile({ lang }: { lang: Lang }) {
  const { settings } = useSettings();
  const { openFilter } = useView();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const cacheKey = `${settings.tmdbKey ? "tmdb" : "none"}:${lang.iso}`;
  const [inView, setInView] = useState(() => langBackdropCache.has(cacheKey));
  const [backdrop, setBackdrop] = useState<string | null>(() => langBackdropCache.get(cacheKey) ?? null);
  const from = `oklch(0.28 0.055 ${lang.hue})`;
  const to = `oklch(0.13 0.025 ${lang.hue})`;
  const wash = `oklch(0.24 0.06 ${lang.hue} / 0.36)`;

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "450px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || !settings.tmdbKey) return;
    if (langBackdropCache.has(cacheKey)) {
      setBackdrop(langBackdropCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const movieList = await tmdbDiscover(settings.tmdbKey, "movie", {
        with_original_language: lang.iso,
        sort_by: "popularity.desc",
        "vote_count.gte": "150",
      }).catch(() => []);
      if (cancelled) return;
      let candidates = movieList.map((m) => m.background).filter((u): u is string => Boolean(u));
      if (candidates.length === 0) {
        const tvList = await tmdbDiscover(settings.tmdbKey, "tv", {
          with_original_language: lang.iso,
          sort_by: "popularity.desc",
          "vote_count.gte": "100",
        }).catch(() => []);
        if (cancelled) return;
        candidates = tvList.map((m) => m.background).filter((u): u is string => Boolean(u));
      }
      const picked = candidates.find((u) => !usedLangBackdrops.has(u)) ?? candidates[0] ?? null;
      if (picked) usedLangBackdrops.add(picked);
      langBackdropCache.set(cacheKey, picked);
      setBackdrop(picked);
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, cacheKey, lang.iso, settings.tmdbKey]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() =>
        openFilter({ kind: "language", mediaType: "movie", name: lang.name, iso: lang.iso })
      }
      className="group relative aspect-[5/4] w-full cursor-pointer overflow-hidden rounded-2xl border border-edge-soft text-start shadow-[0_4px_18px_-10px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/0 transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] hover:-translate-y-0.5 hover:border-edge hover:ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
    >
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] data-[on=true]:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          onLoad={(e) => e.currentTarget.setAttribute("data-on", "true")}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-75 motion-reduce:transition-none"
        style={{ background: `linear-gradient(150deg, ${wash}, rgba(10, 11, 13, 0.25))` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/32 to-transparent"
      />
      <span
        className="pointer-events-none absolute end-4 top-3.5 max-w-[calc(100%-2rem)] truncate select-none text-end font-display text-[26px] font-medium leading-none tracking-tight text-white/25 drop-shadow-[0_1px_10px_rgba(0,0,0,0.35)]"
        aria-hidden
      >
        {lang.endonym}
      </span>
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
        <h3 className="min-w-0 flex-1 line-clamp-2 font-display text-[22px] font-medium leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
          {t(lang.name)}
        </h3>
        <span
          className="dir-icon shrink-0 text-[18px] leading-none text-white/80 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          aria-hidden
        >
          ›
        </span>
      </div>
    </button>
  );
}
