import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { needsImdbForPoster, needsTmdbForPoster, rpdbPoster } from "@/lib/providers/rpdb";
import {
  tmdbIdFromImdb,
  tmdbImdbId,
  useTmdbIdFromImdb,
  useTmdbImdbId,
} from "@/lib/providers/tmdb/tmdb-imdb-resolve";
import { useSettings } from "@/lib/settings";

type Ratio = "portrait" | "landscape" | "wide";

export function useRpdbAltId(
  rpdbKey: string,
  metaId: string,
  type?: "movie" | "series",
): string | undefined {
  const { settings } = useSettings();
  const wantImdb = needsImdbForPoster(rpdbKey, metaId);
  const wantTmdb = needsTmdbForPoster(rpdbKey, metaId);
  const imdb = useTmdbImdbId(wantImdb ? metaId : undefined);
  const tmdb = useTmdbIdFromImdb(wantTmdb ? metaId : undefined);
  useEffect(() => {
    if (wantImdb && settings.tmdbKey) void tmdbImdbId(settings.tmdbKey, metaId);
    if (wantTmdb && settings.tmdbKey) void tmdbIdFromImdb(settings.tmdbKey, metaId, type);
  }, [wantImdb, wantTmdb, settings.tmdbKey, metaId, type]);
  if (wantImdb && typeof imdb === "string" && imdb.startsWith("tt")) return imdb;
  if (wantTmdb && typeof tmdb === "string") return tmdb;
  return undefined;
}

export function usePosterChain(
  rpdbKey: string,
  metaId: string,
  metaPoster?: string,
  type?: "movie" | "series",
) {
  const altId = useRpdbAltId(rpdbKey, metaId, type);
  const candidates = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of [rpdbPoster(rpdbKey, metaId, metaPoster, altId), metaPoster]) {
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [rpdbKey, metaId, altId, metaPoster]);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [candidates]);
  return {
    src: candidates[idx],
    onError: () => setIdx((i) => (i + 1 < candidates.length ? i + 1 : i)),
  };
}

const ASPECT: Record<Ratio, string> = {
  portrait: "aspect-[2/3]",
  landscape: "aspect-[16/9]",
  wide: "aspect-[16/7]",
};

export function Poster({
  src,
  seed,
  ratio = "portrait",
  className = "",
  children,
  onError,
  lazy = false,
  fallbacks,
}: {
  src?: string;
  seed: string;
  lowResImdb?: string;
  ratio?: Ratio;
  className?: string;
  children?: React.ReactNode;
  onError?: () => void;
  lazy?: boolean;
  fallbacks?: Array<string | null | undefined>;
}) {
  const { settings } = useSettings();
  const effect = settings.posterEffect;
  const candidates = [src, ...(fallbacks ?? [])].filter((u): u is string => !!u);
  const sig = candidates.join("|");
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
  }, [sig]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const current: string | undefined = candidates[idx];
  const advance = useCallback(() => {
    setLoaded(false);
    setIdx((i) => {
      const next = i + 1;
      if (next >= candidates.length) onErrorRef.current?.();
      return next;
    });
  }, [candidates.length]);
  const handleImgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !el.complete) return;
      if (el.naturalWidth > 0) setLoaded(true);
      else advance();
    },
    [advance],
  );
  const showPlate = !current || !loaded;
  const hue = hash(seed) % 360;

  return (
    <div
      className={`harbor-poster your-card relative overflow-hidden rounded-[var(--poster-radius,12px)] ${ASPECT[ratio]} ${className}`}
      style={showPlate ? { background: gradient(hue) } : undefined}
    >
      {current && (
        <img
          key={current}
          ref={handleImgRef}
          src={current}
          alt=""
          decoding="async"
          loading={lazy ? "lazy" : undefined}
          onLoad={() => setLoaded(true)}
          onError={advance}
          className="absolute inset-0 h-full w-full object-cover"
          style={
            effect === "off"
              ? { opacity: 1 }
              : { opacity: loaded ? 1 : 0, transition: "opacity 300ms ease-out" }
          }
        />
      )}
      {children}
    </div>
  );
}

export function posterPlate(seed: string): string {
  return gradient(hash(seed) % 360);
}

function gradient(hue: number) {
  const a = hue;
  const b = (hue + 140) % 360;
  const c = (hue + 60) % 360;
  return `
    radial-gradient(ellipse at 25% 30%, oklch(0.45 0.14 ${a}) 0%, transparent 55%),
    radial-gradient(ellipse at 75% 75%, oklch(0.32 0.10 ${b}) 0%, transparent 55%),
    linear-gradient(135deg, oklch(0.20 0.05 ${c}), oklch(0.10 0.02 ${b}))
  `;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}
