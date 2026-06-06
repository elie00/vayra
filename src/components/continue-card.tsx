import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, X } from "lucide-react";
import { meta as fetchMeta, type Meta } from "@/lib/cinemeta";
import { useContextMenu } from "@/lib/context-menu";
import { readSnapshot, useSnapshotVersion } from "@/lib/snapshots";
import { episodeFromVideoId, type LibraryItem } from "@/lib/stremio";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";

type Props = {
  item: LibraryItem;
  watched?: boolean;
  onDismiss?: (id: string) => void;
};

export const ContinueCard = memo(function ContinueCard({ item, watched = false, onDismiss }: Props) {
  const { openPicker } = useView();
  const { settings } = useSettings();
  const { open: openContextMenu } = useContextMenu();
  useSnapshotVersion();
  const snapshot = readSnapshot(item._id);
  const dur = item.state?.duration ?? 0;
  const off = item.state?.timeOffset ?? 0;
  const progress = dur > 0 ? Math.min(1, off / dur) : 0;
  const remaining = dur > 0 ? formatRemaining(dur - off) : "";
  const ep =
    item.state?.season && item.state?.episode
      ? { season: item.state.season, episode: item.state.episode }
      : episodeFromVideoId(item.state?.video_id);
  const sub = ep ? `S${ep.season}E${ep.episode}` : "";
  const [logo, setLogo] = useState<string | undefined>();
  const [metaBg, setMetaBg] = useState<string | undefined>();
  const [hydratedMeta, setHydratedMeta] = useState<Meta | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const cardRef = useRef<HTMLButtonElement>(null);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [snapshot, item.background, item.poster, metaBg]) {
      if (!u) continue;
      const d = downscaleTmdb(u)!;
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  }, [snapshot, item.background, item.poster, metaBg]);

  const src = candidates[imgIdx];

  useEffect(() => {
    setLogo(undefined);
    setMetaBg(undefined);
    setHydratedMeta(null);
    setImgIdx(0);
    const el = cardRef.current;
    if (!el) return;
    let cancelled = false;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      fetchMeta(item.type, item._id)
        .then((full) => {
          if (cancelled || !full) return;
          setHydratedMeta(full);
          if (full.logo) setLogo(full.logo);
          const bg = full.background || full.poster;
          if (bg) setMetaBg(bg);
        })
        .catch(() => {});
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          start();
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [item._id, item.type]);

  const meta: Meta = hydratedMeta
    ? { ...hydratedMeta, id: item._id, type: item.type }
    : {
        id: item._id,
        type: item.type,
        name: item.name,
        poster: item.poster,
        background: item.background,
      };

  const onClick = () => {
    const episode = item.type === "series" && ep ? ep : undefined;
    openPicker(meta, episode, { autoPlay: settings.instantPlay });
  };

  return (
    <div className="group relative w-full min-w-0">
      <button
        ref={cardRef}
        onClick={onClick}
        onContextMenu={(e) => openContextMenu(e, { kind: "meta", meta })}
        className="flex w-full min-w-0 flex-col gap-2.5 text-left"
      >
      <div className="harbor-poster relative aspect-[16/9] overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.02]">
        <div className="absolute inset-0 bg-gradient-to-br from-raised via-elevated to-surface" />
        {src && (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgIdx((i) => i + 1)}
            className="absolute inset-0 h-full w-full object-cover brightness-95"
          />
        )}
        <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.45)]" />
        {watched && (
          <span
            className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm"
            title="Watched on Trakt"
          >
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {logo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <img
              src={logo}
              alt=""
              loading="lazy"
              decoding="async"
              className="max-h-[55%] w-auto max-w-[78%] object-contain opacity-80 transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:opacity-25"
            />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas/80 to-transparent" />
        {(sub || remaining) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-canvas/95 px-2 py-1 text-[11px]">
            <Play size={11} fill="currentColor" className="text-ink" />
            {sub && <span className="font-medium text-ink">{sub}</span>}
            {sub && remaining && <span className="text-ink-subtle">·</span>}
            {remaining && <span className="text-ink-muted">{remaining}</span>}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-canvas/40">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-[220ms] group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas ring-1 ring-white/15 shadow-[0_10px_28px_-8px_rgba(0,0,0,0.6)]">
            <Play size={22} fill="currentColor" className="ml-0.5 text-ink" />
          </div>
        </div>
      </div>
      <p className="truncate text-[13px] font-medium text-ink">{item.name}</p>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(item._id);
          }}
          aria-label="Remove from Continue Watching"
          className="group/x absolute right-0.5 top-0.5 z-10 flex h-11 w-11 items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/85 text-ink-muted ring-1 ring-white/12 backdrop-blur-sm transition-colors group-hover/x:bg-canvas group-hover/x:text-ink">
            <X size={20} strokeWidth={2.4} />
          </span>
        </button>
      )}
    </div>
  );
});

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w300/");
}

function formatRemaining(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}
