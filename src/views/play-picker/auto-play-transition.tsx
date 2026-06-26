import { useEffect, useState } from "react";
import { HarborLoader } from "@/components/harbor-loader";
import type { Meta } from "@/lib/cinemeta";
import { consumeRecentStubEvent } from "@/lib/dead-streams";
import { type PlayEpisode } from "@/lib/view";
import { LogoOrText } from "./logo-or-text";

export function AutoPlayTransition({
  meta,
  episode,
  resolving,
  attemptIdx,
  onCancel,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  resolving: boolean;
  attemptIdx?: number;
  onCancel: () => void;
}) {
  void resolving;
  const backdrop = episode?.still || meta.background || meta.poster;
  const [stubNotice, setStubNotice] = useState<string | null>(null);
  useEffect(() => {
    const ev = consumeRecentStubEvent(8000);
    if (!ev) return;
    setStubNotice("Last source wasn't actually cached on your debrid yet. Trying another.");
    const t = window.setTimeout(() => setStubNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <main className="fixed inset-0 z-[120] overflow-hidden bg-black">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-20 h-16" />
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[28px] saturate-150"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/85" />
      <div className="relative flex h-full flex-col items-center justify-center gap-7 px-8 text-center">
        <LogoOrText
          logo={meta.logo ?? null}
          fallbackText={meta.name}
          imgClass="max-h-44 w-auto max-w-[72%] animate-loader-pulse object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          textClass="animate-loader-pulse font-display text-[64px] font-medium leading-[0.96] tracking-tight text-white drop-shadow-[0_18px_45px_rgba(0,0,0,0.7)]"
        />
        {episode && (
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.32em] text-white/70">
            S{episode.imdbSeason ?? episode.season} · E
            {String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}
            {episode.name ? ` · ${episode.name}` : ""}
          </p>
        )}
        <HarborLoader size="md" caption={attemptIdx && attemptIdx > 0 ? `Trying source ${attemptIdx + 1}` : "Connecting"} />
        {stubNotice && (
          <p className="max-w-md text-[13px] leading-relaxed text-amber-200/80">
            {stubNotice}
          </p>
        )}
      </div>
      <button
        onClick={onCancel}
        className="absolute bottom-10 left-1/2 z-10 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/45 px-6 text-[13.5px] font-medium text-white/75 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60 hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        Cancel
      </button>
    </main>
  );
}
