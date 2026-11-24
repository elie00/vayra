import { HardDrive, Play, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { useLuma, lumaStore, type LumaResumeEntry } from "@/lib/luma";
import { lumaResumeEpisode, resolveLumaResumeTarget } from "@/lib/luma/resume-target";
import { useView } from "@/lib/view";

function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function LumaResumeCard({ entry, announce }: { entry: LumaResumeEntry; announce: (message: string) => void }) {
  const t = useT();
  const { openPicker, openPlayer } = useView();
  const progress = entry.durationMs > 0 ? Math.max(0, Math.min(1, entry.positionMs / entry.durationMs)) : 0;
  const episode = lumaResumeEpisode(entry);
  const subtitle = [
    episode ? `S${episode.season} · E${String(episode.episode).padStart(2, "0")}` : null,
    formatRemaining(entry.durationMs - entry.positionMs),
  ].filter(Boolean).join(" · ");

  const resume = () => {
    const target = resolveLumaResumeTarget(entry);
    if (target.kind === "missing-local") {
      lumaStore().clearResume(entry.id);
      announce(t("This local file is no longer in your library."));
      return;
    }
    if (target.kind === "local") {
      openPlayer(target.player);
      return;
    }
    openPicker(target.meta, target.episode, { autoPlay: true, resume: true });
  };

  return (
    <article className="group relative isolate aspect-[16/9] overflow-hidden rounded-2xl border border-edge-soft/80 bg-surface shadow-[0_18px_45px_-30px_rgba(0,0,0,0.75)] outline-none transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-edge focus-within:ring-2 focus-within:ring-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {entry.presentation.artwork ? (
        <img src={entry.presentation.artwork} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-elevated text-ink-muted"><HardDrive size={24} /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/38 to-transparent" />
      <button type="button" onClick={resume} aria-label={t("Resume {title} with LUMA", { title: entry.presentation.title })} className="absolute inset-0 z-10 text-start outline-none">
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight text-white">{entry.presentation.title}</span>
            <span className="mt-1 block truncate text-[11.5px] font-medium tabular-nums text-white/75">{subtitle}</span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform duration-150 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"><Play size={16} fill="currentColor" className="ms-0.5" /></span>
        </span>
      </button>
      <button type="button" onClick={() => lumaStore().clearResume(entry.id)} aria-label={t("Remove {title} from LUMA history", { title: entry.presentation.title })} className="absolute end-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/75 opacity-100 outline-none backdrop-blur-md transition-[opacity,background-color,color] duration-150 hover:bg-black/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><X size={14} /></button>
      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/15" aria-hidden="true"><div className="h-full bg-white" style={{ width: `${progress * 100}%` }} /></div>
    </article>
  );
}

export function LumaResumeSection({ title }: { title?: string } = {}) {
  const t = useT();
  const snapshot = useLuma();
  const [announcement, setAnnouncement] = useState("");
  if (!snapshot.document.preferences.rememberActivity || snapshot.document.resumes.length === 0) return null;

  return (
    <section aria-label={t("Resume with LUMA")}>
      <Row
        title={title ?? t("Resume with LUMA")}
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
