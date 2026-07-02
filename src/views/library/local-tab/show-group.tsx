import { HardDrive, ListVideo, Play, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Poster, usePosterChain } from "@/components/poster";
import { removeLocalEntry, type LocalEntry } from "@/lib/local-library";
import { useSettings } from "@/lib/settings";
import { useView, type PlayerSrc } from "@/lib/view";
import { useT } from "@/lib/i18n";

export type LocalGroup =
  | { kind: "movie"; entry: LocalEntry }
  | { kind: "show"; key: string; head: LocalEntry; episodes: LocalEntry[] };

export function groupLocal(items: LocalEntry[]): LocalGroup[] {
  const out: LocalGroup[] = [];
  const showIdx = new Map<string, number>();
  for (const it of items) {
    if (it.type !== "show") {
      out.push({ kind: "movie", entry: it });
      continue;
    }
    const key = (it.imdbId || it.title || it.filename).toLowerCase();
    const at = showIdx.get(key);
    if (at != null) {
      (out[at] as { episodes: LocalEntry[] }).episodes.push(it);
    } else {
      showIdx.set(key, out.length);
      out.push({ kind: "show", key, head: it, episodes: [it] });
    }
  }
  for (const g of out) {
    if (g.kind !== "show") continue;
    g.episodes.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    g.head = g.episodes.find((e) => e.poster) ?? g.episodes[0];
  }
  return out;
}

export function episodeLabel(e: LocalEntry): string | null {
  if (e.type === "show" && e.season != null && e.episode != null) {
    return `S${String(e.season).padStart(2, "0")}E${String(e.episode).padStart(2, "0")}`;
  }
  return null;
}

export function localPlayerSrc(entry: LocalEntry): PlayerSrc {
  const epLabel = episodeLabel(entry);
  return {
    meta: {
      id: entry.imdbId ?? `local:${entry.id}`,
      type: entry.type === "show" ? "series" : "movie",
      name: entry.title,
      poster: entry.poster ?? undefined,
      releaseInfo: entry.year ? String(entry.year) : undefined,
    },
    imdbId: entry.imdbId ?? undefined,
    episode: epLabel
      ? { season: entry.season as number, episode: entry.episode as number, imdbId: entry.imdbId ?? undefined }
      : undefined,
    url: entry.path,
    title: entry.title,
    subtitle: epLabel ?? (entry.year ? String(entry.year) : entry.filename),
    notWebReady: true,
  };
}

export function ShowGroupCard({ head, episodes }: { head: LocalEntry; episodes: LocalEntry[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    head.imdbId ?? `local:${head.id}`,
    head.poster ?? undefined,
    "series",
  );
  const countLabel = episodes.length === 1 ? t("1 episode") : t("{n} episodes", { n: episodes.length });
  return (
    <div className="group relative flex flex-col gap-2 text-start" onMouseLeave={() => setConfirm(false)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] outline-none ring-offset-2 ring-offset-canvas focus-visible:ring-2 focus-visible:ring-ink"
      >
        <Poster
          src={poster.src}
          onError={poster.onError}
          seed={head.id}
          lazy
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-md bg-canvas/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted backdrop-blur-sm">
          <HardDrive size={9} strokeWidth={2.4} />
          {t("local")}
        </span>
        <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-md bg-canvas/85 px-2 py-0.5 text-[10.5px] font-semibold text-ink backdrop-blur-sm">
          <ListVideo size={11} strokeWidth={2.2} />
          {episodes.length}
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
            <ListVideo size={18} strokeWidth={2.2} />
          </span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm) {
              episodes.forEach((ep) => removeLocalEntry(ep.id));
              setConfirm(false);
            } else {
              setConfirm(true);
            }
          }}
          className={`absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 ${
            confirm
              ? "bg-danger"
              : "bg-canvas/70 opacity-0 backdrop-blur-sm hover:bg-canvas/90 group-hover:opacity-100"
          }`}
          aria-label={confirm ? t("Confirm remove") : t("Remove from library")}
        >
          {confirm ? <RefreshCw size={11} strokeWidth={2.4} /> : <Trash2 size={11} strokeWidth={2.2} />}
        </button>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="text-start">
        <p className="truncate text-[13px] font-medium text-ink transition-colors hover:text-accent" title={head.title}>
          {head.title}
        </p>
        <p className="-mt-1.5 truncate text-[11.5px] text-ink-subtle">{countLabel}</p>
      </button>
      {open && <EpisodeListModal head={head} episodes={episodes} onClose={() => setOpen(false)} />}
    </div>
  );
}

function EpisodeListModal({
  head,
  episodes,
  onClose,
}: {
  head: LocalEntry;
  episodes: LocalEntry[];
  onClose: () => void;
}) {
  const t = useT();
  const { openPlayer } = useView();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-canvas/80 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-in flex max-h-[82vh] w-[min(94vw,540px)] flex-col rounded-2xl border border-edge-soft bg-elevated shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge-soft px-5 pb-3.5 pt-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate font-display text-[18px] font-medium text-ink">{head.title}</h2>
            <span className="text-[12px] text-ink-subtle">
              {episodes.length === 1 ? t("1 episode") : t("{n} episodes", { n: episodes.length })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto p-2.5">
          {episodes.map((ep) => (
            <button
              key={ep.id}
              type="button"
              onClick={() => {
                openPlayer(localPlayerSrc(ep));
                onClose();
              }}
              className="group/ep flex items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-raised"
            >
              <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md bg-canvas/60 font-mono text-[12px] font-bold tabular-nums text-ink-muted ring-1 ring-edge-soft">
                {episodeLabel(ep) ?? "-"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={ep.filename}>
                {ep.filename}
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors group-hover/ep:bg-ink group-hover/ep:text-canvas">
                <Play size={13} strokeWidth={2.4} fill="currentColor" className="ml-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
