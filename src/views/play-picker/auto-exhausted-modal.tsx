import { useRef } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useView, type PlayEpisode } from "@/lib/view";
import { openUrl } from "@/lib/window";

export function AutoExhaustedModal({
  meta,
  episode,
  triedCount,
  otherLanguageCount = 0,
  onBrowseManually,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  triedCount: number;
  /** Sources left out of automatic play because they declare only other audio languages. */
  otherLanguageCount?: number;
  onBrowseManually: () => void;
}) {
  const t = useT();
  const { goBack } = useView();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const title = meta.name ?? t("this title");
  const epSuffix = episode
    ? ` S${episode.imdbSeason ?? episode.season}E${String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}`
    : "";
  // Nothing was tried because every source declares another language: say so, the
  // usual debrid and addon causes do not apply.
  const languageOnly = triedCount === 0 && otherLanguageCount > 0;
  const subject = "VAYRA: no working stream";
  const body =
    `Streams tried: ${triedCount}\n` +
    `\nWhat happened: VAYRA could not find a working stream automatically.\n` +
    `\nFor privacy, VAYRA did not include the title, source, URL, addon or account. Add only details you explicitly want to share.`;
  const issueUrl = `https://github.com/elie00/vayra/issues/new?${new URLSearchParams({
    title: subject,
    body,
  }).toString()}`;
  return (
    <main className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-black px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-exhausted-title"
        className="w-full max-w-md rounded-2xl bg-elevated p-8 ring-1 ring-edge-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-subtle">
          VAYRA
        </p>
        <h2 id="auto-exhausted-title" className="mt-3 text-start text-[24px] font-semibold leading-tight text-ink" dir="auto">
          {languageOnly ? t("No source in your audio language") : t("We could not find a working stream")}
        </h2>
        {languageOnly ? (
          <p className="mt-3 text-start text-[14px] leading-relaxed text-ink-muted" dir="auto">
            {otherLanguageCount === 1
              ? t("1 source is available in another language for {title}{epSuffix}. VAYRA does not start it on its own; browse the sources to pick it.", { title, epSuffix })
              : t("{count} sources are available in other languages for {title}{epSuffix}. VAYRA does not start them on its own; browse them to pick one.", { count: otherLanguageCount, title, epSuffix })}
          </p>
        ) : (
          <>
            <p className="mt-3 text-start text-[14px] leading-relaxed text-ink-muted" dir="auto">
              {t("VAYRA checked every available source for {title}{epSuffix} and none of them played. The most common reasons:", { title, epSuffix })}
            </p>
            <ul className="mt-3 space-y-1.5 text-start text-[13.5px] leading-relaxed text-ink-muted" dir="auto">
              <li dir="auto">{t("· A debrid key (TorBox, Real-Debrid, etc.) is missing or expired.")}</li>
              <li dir="auto">{t("· No stream addon is installed yet (Torrentio, MediaFusion, Comet).")}</li>
              <li dir="auto">{t("· This title is too new and no source has it cached yet.")}</li>
            </ul>
          </>
        )}
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={onBrowseManually}
            className="flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            {t("Browse streams manually")}
          </button>
          <button
            onClick={() => openUrl(issueUrl)}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            {t("Send a bug report")}
          </button>
          <button
            onClick={goBack}
            className="mt-1 text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            {t("Back")}
          </button>
        </div>
      </div>
    </main>
  );
}
