import { useEffect, useMemo, useState } from "react";
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

const loadedPosters = new Set<string>();

function lowResUrl(src?: string): string | undefined {
  if (!src) return undefined;
  const tmdb = src.match(/^(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/);
  if (tmdb) return `${tmdb[1]}w92${tmdb[3]}`;
  const meta = src.match(/^(https?:\/\/images\.metahub\.space\/poster\/)(small|medium|large)(\/.+)$/);
  if (meta) return `${meta[1]}small${meta[3]}`;
  const imdb = src.match(/[?&]imdb_id=(tt\d+)/i);
  if (imdb) return `https://images.metahub.space/poster/small/${imdb[1]}/img`;
  return undefined;
}

function lowResId(id?: string): string | undefined {
  if (!id) return undefined;
  const m = id.match(/(tt\d+)/);
  if (m) return `https://images.metahub.space/poster/small/${m[1]}/img`;
  return undefined;
}

export function Poster({
  src,
  seed,
  lowResImdb,
  ratio = "portrait",
  className = "",
  children,
  onError,
  lazy = false,
}: {
  src?: string;
  seed: string;
  lowResImdb?: string;
  ratio?: Ratio;
  className?: string;
  children?: React.ReactNode;
  onError?: () => void;
  lazy?: boolean;
}) {
  const { settings } = useSettings();
  const effect = settings.posterEffect;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);
  const showGradient = !src || failed;
  const showPlate = showGradient || (effect !== "blur" && !loaded);
  const lowSrc = useMemo(
    () => lowResUrl(src) ?? lowResId(lowResImdb) ?? lowResId(seed),
    [src, lowResImdb, seed],
  );
  const hue = hash(seed) % 360;

  return (
    <div
      className={`harbor-poster your-card relative overflow-hidden rounded-[var(--poster-radius,12px)] ${ASPECT[ratio]} ${className}`}
      style={showPlate ? { background: gradient(hue) } : undefined}
    >
      {effect === "blur" && lowSrc && !showGradient && (
        <img
          key={lowSrc}
          src={lowSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          className={`absolute inset-0 h-full w-full scale-110 object-cover blur-xl transition-opacity duration-500 ${loaded ? "opacity-0" : "opacity-100"}`}
        />
      )}
      {!showGradient && (
        <img
          key={src}
          ref={(el) => {
            if (!el || !el.complete) return;
            if (el.naturalWidth > 0) setLoaded(true);
            else {
              setFailed(true);
              onError?.();
            }
          }}
          src={src}
          alt=""
          decoding="async"
          loading={lazy ? "lazy" : undefined}
          onLoad={() => {
            if (src) loadedPosters.add(src);
            setLoaded(true);
          }}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
          className="absolute inset-0 h-full w-full object-cover"
          style={
            effect === "off"
              ? { opacity: failed ? 0 : 1 }
              : effect === "fade"
                ? {
                    opacity: failed ? 0 : loaded ? 1 : 0,
                    transition: "opacity 350ms ease-out",
                    willChange: "opacity",
                  }
                : {
                    opacity: failed ? 0 : 1,
                    transform: loaded ? "scale(1)" : "scale(1.06)",
                    filter: loaded ? "blur(0px)" : "blur(14px)",
                    transition:
                      "opacity 350ms ease-out, transform 600ms cubic-bezier(0.22, 1, 0.36, 1), filter 500ms ease-out",
                    willChange: "opacity, transform, filter",
                  }
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
