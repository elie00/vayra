import { HardDrive, Play, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Row } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useLuma, lumaStore, type LumaResumeEntry } from "@/lib/luma";
import { readLocalLibrary } from "@/lib/local-library";
import { localPlayerSrc } from "@/lib/local-library/player-src";
import { useView, type PlayEpisode } from "@/lib/view";

function asMeta(entry: LumaResumeEntry): Meta {
  return {
    id: entry.ref.kind === "catalog" ? entry.ref.metaId : `local:${entry.ref.entryId}`,
    type: entry.ref.mediaType,
    name: entry.presentation.title,
    poster: entry.presentation.artwork,
    background: entry.presentation.artwork,
  };
}

function asEpisode(entry: LumaResumeEntry): PlayEpisode | undefined {
  const episode = entry.ref.episode;
  if (!episode) return undefined;
  return {
    season: episode.season,
    episode: episode.episode,
    videoId: episode.canonicalVideoId,
    name: entry.presentation.episodeTitle,
  };
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function LumaResumeCard({ entry, announce }: { entry: LumaResumeEntry; announce: (message: string) => void }) {
  const t = useT();
  const { openPicker, openPlayer } = useView();
  const progress = entry.durationMs > 0 ? Math.max(0, Math.min(1, entry.positionMs / entry.durationMs)) : 0;
  const episode = asEpisode(entry);
  const subtitle = [
    episode ? `S${episode.season} · E${String(episode.episode).padStart(2, "0")}` : null,
    formatRemaining(entry.durationMs - entry.positionMs),
  ].filter(Boolean).join(" · ");

  const resume = () => {
    if (entry.ref.kind === "local-library") {
      const entryId = entry.ref.entryId;
      const local = readLocalLibrary().find((item) => item.id === entryId);
      if (!local) {
        lumaStore().clearResume(entry.id);
        announce(t("This local file is no longer in your library."));
        return;
      }
      openPlayer(localPlayerSrc(local));
      return;
    }
    openPicker(asMeta(entry), episode, { autoPlay: true, resume: true });
  };

  return (
    <article className="group relative isolate aspect-[16/9] overflow-hidden rounded-2xl border border-edge-soft bg-elevated shadow-[0_18px_45px_-30px_rgba(0,0,0,0.75)] outline-none transition-transform hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-ink motion-reduce:transition-none">
      {entry.presentation.artwork ? (
        <img src={entry.presentation.artwork} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-elevated text-ink-muted"><HardDrive size={24} /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
      <button type="button" onClick={resume} aria-label={t("Resume {title} with LUMA", { title: entry.presentation.title })} className="absolute inset-0 z-10 text-start outline-none">
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-white">{entry.presentation.title}</span>
            <span className="mt-0.5 block truncate text-[11.5px] text-white/65">{subtitle}</span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg"><Play size={16} fill="currentColor" className="ms-0.5" /></span>
        </span>
      </button>
      <button type="button" onClick={() => lumaStore().clearResume(entry.id)} aria-label={t("Remove {title} from LUMA history", { title: entry.presentation.title })} className="absolute end-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white/70 opacity-100 outline-none backdrop-blur-md hover:bg-black/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><X size={15} /></button>
      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/15" aria-hidden="true"><div className="h-full bg-white" style={{ width: `${progress * 100}%` }} /></div>
    </article>
  );
}

export function LumaResumeSection() {
  const t = useT();
  const snapshot = useLuma();
  const [announcement, setAnnouncement] = useState("");
  if (!snapshot.document.preferences.rememberActivity || snapshot.document.resumes.length === 0) return null;

  return (
    <section aria-label={t("Resume with LUMA")}>
      <Row
        title={t("Resume with LUMA")}
        titleExtra={<span className="inline-flex items-center gap-1.5 rounded-full border border-edge-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle"><ShieldCheck size={11} />{t("Local only")}</span>}
        min={260}
        shape="landscape"
        scrollKey="home:luma:resume"
      >
        {snapshot.document.resumes.map((entry) => <LumaResumeCard key={entry.id} entry={entry} announce={setAnnouncement} />)}
      </Row>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}
