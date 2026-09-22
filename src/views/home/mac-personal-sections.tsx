import { useEffect, useMemo, useState } from "react";
import { Film } from "lucide-react";
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

export function MacPersonalSections({ items, libraryItems, onDismiss }: { items: LibraryItem[]; libraryItems: LibraryItem[]; onDismiss: (item: LibraryItem) => void }) {
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
  const downloads = useDownloads().filter((d) => d.status === "done").slice(0, 12);
  const [error, setError] = useState("");
  return <section aria-label={t("Your viewing")} className="flex flex-col gap-8">
    <header><h1 className="mac-page-title">{t("Home")}</h1><p className="mt-2 text-[14px] text-ink-muted">{t("Your next viewing, right where you left it.")}</p></header>
    {resumes.length > 0 && <Row title={t("Continue Watching")} min={260} shape="landscape" scrollKey="home:mac:resume">{resumes.map((resume) => resume.kind === "local" ? <LumaResumeCard key={`local:${resume.entry.id}`} entry={resume.entry} announce={setError} /> : <ContinueCard key={`connected:${resume.item._id}`} item={resume.item} onDismiss={onDismiss} />)}</Row>}
    {!resumes.length && <p className="rounded-2xl bg-elevated p-5 text-[14px] text-ink-muted">{t("Start a video and find your progress here next time.")}</p>}
    <Row title={t("My Watchlist")} min={150} scrollKey="home:mac:watchlist" headerRight={<button className="mac-secondary-button" onClick={() => setView("library")}>{t("My library")}</button>}>
      {watchlist.slice(0, 12).map((meta) => <PickCard key={meta.id} meta={meta} />)}
      {!watchlist.length && <button className="mac-secondary-button" onClick={() => setView("discover")}>{t("Find something to watch")}</button>}
    </Row>
    {downloads.length > 0 && <Row title={t("Available offline")} min={240} shape="compact" scrollKey="home:mac:offline" headerRight={<button className="mac-secondary-button" onClick={() => setView("downloads")}>{t("Open downloads")}</button>}>
      {downloads.map((d) => (
        <button
          key={d.id}
          type="button"
          title={[d.title, d.subtitle || t("Watch offline")].join("\n")}
          onClick={() => { void validatedDownloadSource(d).then((src) => { if (src) openPlayer(src); else setError(t("This file is missing or incomplete. Download it again from the title page.")); }); }}
          className="flex h-28 w-full min-w-0 items-center gap-3 rounded-2xl bg-elevated p-4 text-start hover:bg-raised"
        >
          <span aria-hidden="true" className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised text-ink-muted">
            {d.poster ? <img src={d.poster} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Film size={22} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-[14px] leading-5 font-semibold text-ink">{d.title}</span>
            <span className="mt-1 block truncate text-[12px] leading-4 text-ink-muted">{d.subtitle || t("Watch offline")}</span>
          </span>
        </button>
      ))}
    </Row>}
    {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
  </section>;
}
