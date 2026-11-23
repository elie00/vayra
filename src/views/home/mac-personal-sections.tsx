import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Bookmark, Compass, Download, Film, Play } from "lucide-react";
import { Row } from "@/components/row";
import { PickCard } from "@/components/pick-card";
import { ContinueCard } from "@/components/continue-card";
import { useT } from "@/lib/i18n";
import { useLuma } from "@/lib/luma";
import { useDownloads } from "@/lib/download/downloads-store";
import { validatedDownloadSource } from "@/lib/download/offline-playback";
import { useView } from "@/lib/view";
import type { LibraryItem } from "@/lib/stremio";
import { readLocalEntries, subscribeWatchlist } from "@/lib/watchlist";
import { filterLibrary, mergeWatchlist } from "@/lib/watchlist-merge";
import { useSettings } from "@/lib/settings";
import { useTrakt } from "@/lib/trakt/provider";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import type { TraktItem } from "@/lib/trakt/types";
import { LumaResumeCard } from "./luma-resume-section";
import { unifiedResumes } from "@/lib/unified-resumes";
import { connectResumes, publishHistory } from "@/lib/connect/history";

export function MacPersonalSections({ items, libraryItems, onDismiss, notice }: { items: LibraryItem[]; libraryItems: LibraryItem[]; onDismiss: (item: LibraryItem) => void; notice?: ReactNode }) {
  const t = useT();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const [localEntries, setLocalEntries] = useState(readLocalEntries);
  const [trakt, setTrakt] = useState<TraktItem[]>([]);
  useEffect(() => {
    const refresh = () => setLocalEntries(readLocalEntries());
    const unsubscribe = subscribeWatchlist(refresh);
    window.addEventListener("storage", refresh);
    return () => { unsubscribe(); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!traktConnected) { setTrakt([]); return; }
    void fetchWatchlist().then((entries) => { if (!cancelled) setTrakt(entries); }).catch(() => {});
    return () => { cancelled = true; };
  }, [traktConnected]);
  const watchlist = useMemo(() => mergeWatchlist(localEntries, filterLibrary(libraryItems, settings.libraryBookmarkedOnly), trakt)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0)).map((entry) => entry.meta), [localEntries, libraryItems, settings.libraryBookmarkedOnly, trakt]);
  const { openPlayer, setView } = useView();
  const luma = useLuma();
  const resumes = unifiedResumes(luma.document.preferences.rememberActivity ? luma.document.resumes : [], items);
  // VAYRA Connect: paired phones pick up where this Mac left off.
  const history = JSON.stringify(connectResumes(resumes));
  useEffect(() => {
    if (!settings.connectEnabled) return;
    void publishHistory(JSON.parse(history)).catch(() => { /* Connect stopped: nobody to tell. */ });
  }, [history, settings.connectEnabled]);
  const doneDownloads = useDownloads().filter((d) => d.status === "done");
  const downloads = doneDownloads.slice(0, 12);
  const [error, setError] = useState("");
  return (
    <section aria-label={t("Your viewing")} className="flex flex-col gap-9">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="vayra-kicker">{t("Your viewing")}</span>
            <h1 className="mac-page-title">{t("Home")}</h1>
            <p className="max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
              {t("Your next viewing, right where you left it.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setView("library")}
              className="group inline-flex min-h-10 items-center gap-2 rounded-xl border border-edge-soft/75 bg-surface/85 px-3.5 py-2 text-[13px] font-medium text-ink-muted transition-[border-color,background-color,color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink"
            >
              <Bookmark size={14} strokeWidth={2} className="text-ink-subtle group-hover:text-ink" />
              <span>{t("My Watchlist")}</span>
              <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink">
                {watchlist.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setView("downloads")}
              className="group inline-flex min-h-10 items-center gap-2 rounded-xl border border-edge-soft/75 bg-surface/85 px-3.5 py-2 text-[13px] font-medium text-ink-muted transition-[border-color,background-color,color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink"
            >
              <Download size={14} strokeWidth={2} className="text-ink-subtle group-hover:text-ink" />
              <span>{t("Downloads")}</span>
              <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink">
                {doneDownloads.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setView("discover")}
              className="mac-secondary-button"
            >
              <Compass size={14} strokeWidth={2} />
              <span>{t("Explore")}</span>
              <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
            </button>
          </div>
        </div>
        <div className="vayra-header-rule" aria-hidden="true" />
      </header>

      {notice}

      {resumes.length > 0 ? (
        <Row
          title={t("Continue Watching")}
          titleExtra={
            <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
              {resumes.length}
            </span>
          }
          min={260}
          shape="landscape"
          scrollKey="home:mac:resume"
        >
          {resumes.map((resume) =>
            resume.kind === "local" ? (
              <LumaResumeCard key={`local:${resume.entry.id}`} entry={resume.entry} announce={setError} />
            ) : (
              <ContinueCard key={`connected:${resume.item._id}`} item={resume.item} onDismiss={onDismiss} />
            ),
          )}
        </Row>
      ) : (
        <div className="vayra-surface flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/70 bg-elevated/80 text-ink-subtle">
              <Play size={16} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink">{t("Continue Watching")}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {t("Start a video and find your progress here next time.")}
              </p>
            </div>
          </div>
          <button type="button" className="mac-secondary-button" onClick={() => setView("discover")}>
            {t("Find something to watch")}
          </button>
        </div>
      )}

      <Row
        title={t("My Watchlist")}
        titleExtra={
          watchlist.length > 0 ? (
            <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
              {watchlist.length}
            </span>
          ) : undefined
        }
        min={150}
        scrollKey="home:mac:watchlist"
        headerRight={
          <button type="button" className="mac-secondary-button" onClick={() => setView("library")}>
            {t("My library")}
            <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
          </button>
        }
      >
        {watchlist.slice(0, 12).map((meta) => <PickCard key={meta.id} meta={meta} />)}
        {!watchlist.length && (
          <button type="button" className="mac-secondary-button" onClick={() => setView("discover")}>
            {t("Find something to watch")}
          </button>
        )}
      </Row>

      {downloads.length > 0 && (
        <Row
          title={t("Available offline")}
          titleExtra={
            <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
              {doneDownloads.length}
            </span>
          }
          min={240}
          shape="compact"
          scrollKey="home:mac:offline"
          headerRight={
            <button type="button" className="mac-secondary-button" onClick={() => setView("downloads")}>
              {t("Open downloads")}
              <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
            </button>
          }
        >
          {downloads.map((d) => (
            <button
              key={d.id}
              type="button"
              title={[d.title, d.subtitle || t("Watch offline")].join("\n")}
              onClick={() => { void validatedDownloadSource(d).then((src) => { if (src) openPlayer(src); else setError(t("This file is missing or incomplete. Download it again from the title page.")); }); }}
              className="flex h-28 w-full min-w-0 items-center gap-3.5 rounded-2xl border border-edge-soft/75 bg-surface/85 p-4 text-start shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-edge hover:bg-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span aria-hidden="true" className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised text-ink-muted ring-1 ring-white/10">
                {d.poster ? <img src={d.poster} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Film size={22} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-[14px] leading-5 font-semibold text-ink">{d.title}</span>
                <span className="mt-1 block truncate text-[12px] leading-4 text-ink-muted">{d.subtitle || t("Watch offline")}</span>
              </span>
            </button>
          ))}
        </Row>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
