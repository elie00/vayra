import { useEffect, useMemo, useState } from "react";
import { needsImdbForPoster, rpdbPoster } from "@/lib/providers/rpdb";
import { tmdbImdbId, useTmdbImdbId } from "@/lib/providers/tmdb/tmdb-imdb-resolve";
import { useSettings } from "@/lib/settings";

type Ratio = "portrait" | "landscape" | "wide";

export function useRpdbId(rpdbKey: string, metaId: string): string {
  const { settings } = useSettings();
  const want = needsImdbForPoster(rpdbKey, metaId);
  const imdb = useTmdbImdbId(want ? metaId : undefined);
  useEffect(() => {
    if (want && settings.tmdbKey) void tmdbImdbId(settings.tmdbKey, metaId);
  }, [want, settings.tmdbKey, metaId]);
  return want && typeof imdb === "string" && imdb.startsWith("tt") ? imdb : metaId;
}

export function usePosterChain(rpdbKey: string, metaId: string, metaPoster?: string) {
  const posterId = useRpdbId(rpdbKey, metaId);
  const candidates = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of [rpdbPoster(rpdbKey, posterId, metaPoster), metaPoster]) {
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [rpdbKey, posterId, metaPoster]);
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
}: {
  src?: string;
  seed: string;
  ratio?: Ratio;
  className?: string;
  children?: React.ReactNode;
  onError?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showGradient = !src || failed;
  const hue = hash(seed) % 360;

  return (
    <div
      className={`harbor-poster your-card relative overflow-hidden rounded-xl ${ASPECT[ratio]} ${className}`}
      style={showGradient ? { background: gradient(hue) } : undefined}
    >
      {!showGradient && (
        <img
          key={src}
          src={src}
          alt=""
          decoding="sync"
          onError={() => {
            setFailed(true);
            onError?.();
          }}
          className="absolute inset-0 h-full w-full object-cover"
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
