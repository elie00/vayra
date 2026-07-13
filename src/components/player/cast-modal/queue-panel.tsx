import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  HardDrive,
  ListVideo,
  Play,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { activeProfileId } from "@/lib/active-profile-id";
import { getLumaAuthority, lumaStore, useLuma } from "@/lib/luma";
import { useT } from "@/lib/i18n";
import {
  queueBeginNext,
  queueClear,
  queueRemove,
  queueReorder,
  queueToggle,
  useIsQueued,
  useQueue,
  type QueueItem,
} from "@/lib/queue";
import type { PlayEpisode } from "@/lib/view";

function episodeLabel(ep?: PlayEpisode): string | null {
  if (!ep) return null;
  return `S${ep.imdbSeason ?? ep.season} · E${String(ep.imdbEpisode ?? ep.episode).padStart(2, "0")}`;
}

function persistenceLabel(state: ReturnType<typeof useLuma>["persistence"]): string {
  if (state === "recovered") return "Dernier état sain restauré";
  if (state === "volatile") return "Mode mémoire — stockage local indisponible";
  if (state === "future-schema") return "Mise à jour de VAYRA requise";
  return "Enregistré localement";
}

export function LumaToggleButton({ meta, episode }: { meta: Meta; episode?: PlayEpisode }) {
  const t = useT();
  const queued = useIsQueued(meta, episode);
  return (
    <button
      type="button"
      onClick={() => queueToggle(meta, episode)}
      aria-pressed={queued}
      aria-label={queued ? t("Remove from LUMA") : t("Add to LUMA")}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white ${
        queued ? "bg-white text-black" : "bg-white/[0.08] text-white/70 ring-1 ring-white/12 hover:bg-white/15"
      }`}
    >
      {queued ? <Check size={17} strokeWidth={2.5} /> : <ListVideo size={18} strokeWidth={2.2} />}
    </button>
  );
}

function LumaQueueRow({
  item,
  index,
  count,
  dragId,
  overId,
  onDragId,
  onOverId,
  onDrop,
  onPlay,
  announce,
}: {
  item: QueueItem;
  index: number;
  count: number;
  dragId: string | null;
  overId: string | null;
  onDragId: (id: string | null) => void;
  onOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onPlay: (item: QueueItem) => void;
  announce: (message: string) => void;
}) {
  const t = useT();
  const label = episodeLabel(item.episode);
  const move = (delta: number) => {
    const target = Math.max(0, Math.min(count - 1, index + delta));
    if (target === index) return;
    lumaStore().move(item.id, target);
    announce(t("{title} moved to position {position}", { title: item.meta.name, position: target + 1 }));
  };

  return (
    <li
      draggable
      onDragStart={(event) => {
        onDragId(item.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dragId && overId !== item.id) onOverId(item.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(item.id);
      }}
      onDragEnd={() => {
        onDragId(null);
        onOverId(null);
      }}
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        }
      }}
      tabIndex={0}
      aria-label={t("{title}, position {position} of {count}. Alt plus arrow keys to reorder.", {
        title: item.meta.name,
        position: index + 1,
        count,
      })}
      className={`group grid grid-cols-[auto_4.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white sm:grid-cols-[auto_6rem_minmax(0,1fr)_auto] ${
        overId === item.id && dragId !== item.id
          ? "border-white/45 bg-white/[0.09]"
          : "border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.065]"
      } ${dragId === item.id ? "opacity-45" : ""}`}
    >
      <span className="flex w-7 cursor-grab items-center justify-center text-white/35 active:cursor-grabbing">
        <GripVertical size={17} aria-hidden="true" />
      </span>
      <div className="h-12 overflow-hidden rounded-lg bg-white/[0.06] sm:h-14">
        {(item.meta.background || item.meta.poster) ? (
          <img src={item.meta.background || item.meta.poster} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-white/20"><ListVideo size={18} /></span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-white">{item.meta.name}</p>
        <p className="mt-0.5 text-[12px] text-white/45">
          {[label, t("Position {position}", { position: index + 1 })].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 hidden items-center gap-1 sm:flex">
          <button type="button" onClick={() => move(-1)} disabled={index === 0} className="rounded-md p-1.5 text-white/45 outline-none hover:bg-white/10 hover:text-white disabled:opacity-20 focus-visible:ring-2 focus-visible:ring-white" aria-label={t("Move up")}> <ArrowUp size={14} /> </button>
          <button type="button" onClick={() => move(1)} disabled={index === count - 1} className="rounded-md p-1.5 text-white/45 outline-none hover:bg-white/10 hover:text-white disabled:opacity-20 focus-visible:ring-2 focus-visible:ring-white" aria-label={t("Move down")}> <ArrowDown size={14} /> </button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPlay(item)} aria-label={t("Play {title}", { title: item.meta.name })} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black outline-none transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"><Play size={16} fill="currentColor" className="ms-0.5" /></button>
        <button type="button" onClick={() => queueRemove(item.id)} aria-label={t("Remove {title} from LUMA", { title: item.meta.name })} className="flex h-10 w-10 items-center justify-center rounded-full text-white/45 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"><X size={17} /></button>
      </div>
    </li>
  );
}

export function QueuePanel({ onPlay }: { onPlay: (meta: Meta, episode?: PlayEpisode) => void; currentMeta?: Meta | null; currentEpisode?: PlayEpisode | null }) {
  const t = useT();
  const profileId = activeProfileId();
  const snapshot = useLuma(profileId);
  const queue = useQueue();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const dropQueue = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      const ids = queue.map((item) => item.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from >= 0 && to >= 0) {
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        queueReorder(ids);
        setAnnouncement(t("LUMA queue reordered"));
      }
    }
    setDragId(null);
    setOverId(null);
  };

  const play = (item: QueueItem) => {
    lumaStore(profileId).move(item.id, 0);
    const next = queueBeginNext(getLumaAuthority());
    if (!next.ok) {
      setAnnouncement(next.error.message);
      return;
    }
    onPlay(next.value.meta, next.value.episode);
  };

  return (
    <section aria-labelledby="luma-panel-title" className="flex flex-col gap-5 px-5 pb-7 pt-1 sm:px-8 sm:pb-8">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">{t("Personal continuity")}</p>
          <h2 id="luma-panel-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-white">LUMA</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/50">{t("Your private queue and playback continuity, stored only on this device.")}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${snapshot.persistence === "volatile" || snapshot.persistence === "future-schema" ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-white/[0.04] text-white/55"}`}>
          <HardDrive size={13} aria-hidden="true" /> {persistenceLabel(snapshot.persistence)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
          <span><span className="block text-[13px] font-semibold text-white">{t("Automatic next item")}</span><span className="mt-0.5 block text-[11px] text-white/45">{t("Solo playback only")}</span></span>
          <input type="checkbox" checked={snapshot.document.preferences.autoAdvance} onChange={(event) => lumaStore(profileId).setAutoAdvance(event.target.checked)} className="h-4 w-4 accent-white" />
        </label>
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
          <span><span className="block text-[13px] font-semibold text-white">{t("Remember local activity")}</span><span className="mt-0.5 block text-[11px] text-white/45">{t("Clearing this removes every LUMA resume point")}</span></span>
          <input type="checkbox" checked={snapshot.document.preferences.rememberActivity} onChange={(event) => lumaStore(profileId).setRememberActivity(event.target.checked)} className="h-4 w-4 accent-white" />
        </label>
      </div>

      {queue.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
          <ListVideo size={24} className="text-white/30" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-white/80">{t("Your LUMA queue is empty")}</p>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-white/40">{t("Add a film or episode from its title card. Nothing is uploaded or shared.")}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-white/50">{t("{count} in LUMA", { count: queue.length })}</p>
            <button type="button" onClick={queueClear} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-white/50 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"><Trash2 size={14} />{t("Clear")}</button>
          </div>
          <ol className="flex flex-col gap-2">
            {queue.map((item, index) => (
              <LumaQueueRow key={item.id} item={item} index={index} count={queue.length} dragId={dragId} overId={overId} onDragId={setDragId} onOverId={setOverId} onDrop={dropQueue} onPlay={play} announce={setAnnouncement} />
            ))}
          </ol>
        </>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 text-[11px] leading-relaxed text-white/45">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-white/65" aria-hidden="true" />
        <p>{t("LUMA never sends your queue, progress, sources or activity to CIRA, VARA, VEYA or Supabase.")}</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}
