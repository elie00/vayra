import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { needsImdbForPoster, needsTmdbForPoster, rpdbPoster } from "@/lib/providers/rpdb";
import {
  tmdbIdFromImdb,
  tmdbImdbId,
  useTmdbIdFromImdb,
  useTmdbImdbId,
} from "@/lib/providers/tmdb/tmdb-imdb-resolve";
import { useSettings } from "@/lib/settings";
import { externalToKitsu, kitsuToImdb, kitsuToTvdb } from "@/lib/providers/anime-mapping";
import { tmdbLocalizedPoster } from "@/lib/providers/tmdb/tmdb-images";
import { shouldLocalizePosters } from "@/lib/providers/tmdb/tmdb-image-lang";

// Resolves a card's poster in the user's image-language order (e.g. Arabic then
// English, then the title's original language) via a per-title /images lookup, lazily
// and cached. Independent of the metadata (text) language. Only runs when the top
// image language differs from the catalog poster language; falls back otherwise.
export function useLocalizedPoster(metaId: string, originalLang?: string | null): string | undefined {
  const { settings } = useSettings();
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    setUrl(undefined);
    if (!settings.tmdbKey || !metaId.startsWith("tmdb:") || !shouldLocalizePosters()) return;
    let alive = true;
    void tmdbLocalizedPoster(settings.tmdbKey, metaId, originalLang).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [metaId, originalLang, settings.tmdbKey]);
  return url;
}

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

function useAnimeRpdbIds(
  rpdbKey: string,
  metaId: string,
): { animeImdb?: string; animeTvdb?: string; animeTmdb?: string } {
  const { settings } = useSettings();
  const [animeImdb, setAnimeImdb] = useState<string>();
  const [animeTvdb, setAnimeTvdb] = useState<string>();
  const isAnime = /^(kitsu|mal|anilist|anidb):/.test(metaId);
  useEffect(() => {
    setAnimeImdb(undefined);
    setAnimeTvdb(undefined);
  }, [metaId]);
  useEffect(() => {
    if (!isAnime || (!rpdbKey && !settings.posterBaseUrl)) return;
    const m = metaId.match(/^(kitsu|mal|anilist|anidb):(\d+)/);
    if (!m) return;
    const source = m[1];
    const idNum = Number(m[2]);
    if (!Number.isFinite(idNum)) return;
    let cancelled = false;
    (async () => {
      let kitsuId: number | null = source === "kitsu" ? idNum : null;
      if (kitsuId == null) {
        const armSource = source === "mal" ? "myanimelist" : source;
        kitsuId = await externalToKitsu(armSource, idNum).catch(() => null);
      }
      if (cancelled || kitsuId == null) return;
      const [tt, tv] = await Promise.all([
        kitsuToImdb(kitsuId).catch(() => null),
        kitsuToTvdb(kitsuId).catch(() => null),
      ]);
      if (cancelled) return;
      if (tt) setAnimeImdb(tt);
      if (tv) setAnimeTvdb(String(tv));
    })();
    return () => {
      cancelled = true;
    };
  }, [metaId, isAnime, rpdbKey, settings.posterBaseUrl]);
  const animeTmdb = useTmdbIdFromImdb(animeImdb) ?? undefined;
  return { animeImdb, animeTvdb, animeTmdb };
}

export function usePosterChain(
  rpdbKey: string,
  metaId: string,
  metaPoster?: string,
  type?: "movie" | "series",
  originalLang?: string | null,
) {
  const altId = useRpdbAltId(rpdbKey, metaId, type);
  const { animeImdb, animeTvdb, animeTmdb } = useAnimeRpdbIds(rpdbKey, metaId);
  const localized = useLocalizedPoster(metaId, originalLang);
  const candidates = useMemo(() => {
    // Prefer the language-localized poster; RPDB (when configured) still wins, and
    // the catalog poster remains the final fallback.
    const base = localized ?? metaPoster;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of [
      animeImdb ? rpdbPoster(rpdbKey, animeImdb, base, animeTmdb) : undefined,
      animeTvdb ? rpdbPoster(rpdbKey, `tvdb:${animeTvdb}`, base) : undefined,
      rpdbPoster(rpdbKey, metaId, base, altId),
      localized,
      metaPoster,
    ]) {
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [rpdbKey, metaId, altId, metaPoster, animeImdb, animeTvdb, animeTmdb, localized]);
  const sig = candidates.join("|");
  const failedRef = useRef<Set<string>>(new Set());
  const sigRef = useRef(sig);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  if (sigRef.current !== sig) {
    sigRef.current = sig;
    failedRef.current = new Set();
  }
  const src = candidates.find((u) => !failedRef.current.has(u));
  return {
    src,
    onError: () => {
      if (src && !failedRef.current.has(src)) {
        failedRef.current.add(src);
        bump();
      }
    },
  };
}

// Height is reserved with an in-flow padding spacer (see render below) instead of
// relying solely on CSS `aspect-ratio`. Older WebView2/Chromium engines (≲124, e.g.
// the 123.x runtime shipped on debloated Windows builds) fail to size `aspect-ratio`
// grid items, collapsing every poster card to 0px height so artwork never shows.
// The padding-top hack works identically on every engine.
// https://github.com/harborstremio/harbor/issues/403
const ASPECT_PAD: Record<Ratio, string> = {
  portrait: "150%", // 3 / 2
  landscape: "56.25%", // 9 / 16
  wide: "43.75%", // 7 / 16
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
  const [retry, setRetry] = useState(0);
  const failedRef = useRef<Set<string>>(new Set());
  const firedRef = useRef(false);
  const failBurstRef = useRef<{ t: number; n: number }>({ t: 0, n: 0 });
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setRetry(0);
    failedRef.current = new Set();
    firedRef.current = false;
  }, [sig]);

  let cursor = idx;
  while (cursor < candidates.length && failedRef.current.has(candidates[cursor])) cursor++;
  const current: string | undefined = candidates[cursor];
  const exhausted = candidates.length > 0 && cursor >= candidates.length;

  useEffect(() => {
    if (exhausted && !firedRef.current) {
      firedRef.current = true;
      onErrorRef.current?.();
    }
  }, [exhausted]);

  useEffect(() => {
    if (!exhausted) return;
    const retryNow = () => {
      failedRef.current = new Set();
      firedRef.current = false;
      setIdx(0);
      setRetry((r) => r + 1);
    };
    window.addEventListener("online", retryNow);
    const timer = retry < 4 ? window.setTimeout(retryNow, 1200 * 2 ** retry) : undefined;
    return () => {
      window.removeEventListener("online", retryNow);
      if (timer) window.clearTimeout(timer);
    };
  }, [exhausted, retry]);

  const fail = useCallback((url: string) => {
    const now = Date.now();
    const b = failBurstRef.current;
    if (now - b.t > 1000) {
      b.t = now;
      b.n = 0;
    }
    if (++b.n > 24) return;
    if (failedRef.current.has(url)) return;
    failedRef.current.add(url);
    setLoaded(false);
    setIdx((i) => i + 1);
  }, []);
  const currentRef = useRef(current);
  currentRef.current = current;
  const handleImgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !el.complete) return;
      if (el.naturalWidth > 0) setLoaded(true);
      else if (currentRef.current) fail(currentRef.current);
    },
    [fail],
  );
  const showPlate = !current || !loaded;
  const hue = hash(seed) % 360;

  return (
    <div
      className={`harbor-poster your-card relative w-full overflow-hidden rounded-[var(--poster-radius,12px)] ${className}`}
      style={showPlate ? { background: gradient(hue) } : undefined}
    >
      <div aria-hidden style={{ paddingTop: ASPECT_PAD[ratio] }} />
      {current && (
        <img
          key={current}
          ref={handleImgRef}
          src={current}
          alt=""
          decoding="async"
          loading={lazy ? "lazy" : undefined}
          onLoad={() => setLoaded(true)}
          onError={() => fail(current)}
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
