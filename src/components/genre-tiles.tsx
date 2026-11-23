import { useEffect, useRef, useState } from "react";
import { fetchGenreSample } from "@/lib/feed";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { Row } from "./row";

const GENRE_HUE: Record<string, number> = {
  Action: 24,
  Adventure: 145,
  Animation: 205,
  Comedy: 285,
  Crime: 245,
  Documentary: 155,
  Drama: 235,
  Family: 95,
  Fantasy: 310,
  History: 55,
  Horror: 15,
  Music: 330,
  Mystery: 215,
  Romance: 355,
  "Sci-Fi": 265,
  Thriller: 205,
  War: 250,
  Western: 45,
};

const TILES: string[] = [
  "Action",
  "Adventure",
  "Thriller",
  "Crime",
  "Drama",
  "Romance",
  "Mystery",
  "Sci-Fi",
  "Fantasy",
  "Horror",
  "Comedy",
  "Family",
  "Animation",
  "Western",
  "War",
  "History",
  "Documentary",
  "Music",
];

const backdropCache = new Map<string, string | null>();
const usedBackdrops = new Set<string>();

export function GenreTiles() {
  const t = useT();
  return (
    <Row title={t("Browse by Genre")} min={210} shape="tile" scrollKey="discover:genres" alwaysActive>
      {TILES.map((g) => (
        <GenreTile key={g} genre={g} />
      ))}
    </Row>
  );
}

function GenreTile({ genre }: { genre: string }) {
  const { settings } = useSettings();
  const { openFilter } = useView();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const cacheKey = `${settings.tmdbKey ? "tmdb" : "cinemeta"}:${genre}`;
  const [inView, setInView] = useState(() => backdropCache.has(cacheKey));
  const [backdrop, setBackdrop] = useState<string | null>(() => backdropCache.get(cacheKey) ?? null);
  const hue = GENRE_HUE[genre] ?? 235;
  const from = `oklch(0.28 0.055 ${hue})`;
  const to = `oklch(0.13 0.025 ${hue})`;
  const wash = `oklch(0.24 0.06 ${hue} / 0.36)`;

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
    if (!inView) return;
    if (backdropCache.has(cacheKey)) {
      setBackdrop(backdropCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    fetchGenreSample(settings.tmdbKey, genre)
      .then((list) => {
        if (cancelled) return;
        const candidates = list.map((m) => m.background).filter((u): u is string => Boolean(u));
        const picked = candidates.find((u) => !usedBackdrops.has(u)) ?? candidates[0] ?? null;
        if (picked) usedBackdrops.add(picked);
        backdropCache.set(cacheKey, picked);
        setBackdrop(picked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inView, cacheKey, genre, settings.tmdbKey]);

  const onOpen = () => {
    const id = MOVIE_GENRES[genre];
    if (id == null) return;
    openFilter({ kind: "genre", mediaType: "movie", name: genre, id });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
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
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
        <h3 className="min-w-0 flex-1 line-clamp-2 font-display text-[22px] font-medium leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
          {t(genre)}
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
