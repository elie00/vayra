import { useRef } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useView } from "@/lib/view";

export function NoSourcesConfiguredModal({ meta }: { meta: Meta }) {
  const { goBack, setView, openSettings } = useView();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const title = meta.name ?? "this title";
  return (
    <main className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-black px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-sources-title"
        className="w-full max-w-md rounded-2xl bg-elevated p-8 ring-1 ring-edge-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-subtle">
          Harbor
        </p>
        <h2 id="no-sources-title" className="mt-3 text-[24px] font-semibold leading-tight text-ink">
          No streaming sources yet
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          Harbor needs at least one streaming source before it can play {title}. Pick one of the options below to get set up.
        </p>
        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          <li>· Install a stream addon (Torrentio, Comet, MediaFusion).</li>
          <li>· Add a debrid key (TorBox, Real-Debrid, AllDebrid, Premiumize, Debrid-Link).</li>
        </ul>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={() => setView("addons")}
            className="flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Browse addons
          </button>
          <button
            onClick={() => openSettings("streaming")}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            Open settings
          </button>
          <button
            onClick={goBack}
            className="mt-1 text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
