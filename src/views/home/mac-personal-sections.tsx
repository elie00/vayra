import { useState } from "react";
import { Row } from "@/components/row";
import { PickCard } from "@/components/pick-card";
import { ContinueCard } from "@/components/continue-card";
import { useT } from "@/lib/i18n";
import { useLuma } from "@/lib/luma";
import { useDownloads } from "@/lib/download/downloads-store";
import { validatedDownloadSource } from "@/lib/download/offline-playback";
import { useView } from "@/lib/view";
import type { LibraryItem } from "@/lib/stremio";
import type { Meta } from "@/lib/cinemeta";
import { LumaResumeSection } from "./luma-resume-section";

export function MacPersonalSections({ items, watchlist, onDismiss }: { items: LibraryItem[]; watchlist: Meta[]; onDismiss: (item: LibraryItem) => void }) {
  const t = useT();
  const { openPlayer, setView } = useView();
  const luma = useLuma();
  const localIds = new Set(luma.document.preferences.rememberActivity ? luma.document.resumes.flatMap((e) => e.ref.kind === "catalog" ? [e.ref.metaId] : []) : []);
  const remaining = items.filter((i) => !localIds.has(i._id));
  const downloads = useDownloads().filter((d) => d.status === "done").slice(0, 12);
  const [error, setError] = useState("");
  return <section aria-label={t("Your viewing")} className="flex flex-col gap-8">
    <header><h1 className="mac-page-title">{t("Home")}</h1><p className="mt-2 text-[14px] text-ink-muted">{t("Your next viewing, right where you left it.")}</p></header>
    <LumaResumeSection title={t("Continue Watching")} />
    {remaining.length > 0 && <Row title={t(localIds.size ? "Continue from connected services" : "Continue Watching")} min={260} shape="landscape" scrollKey="home:mac:resume">{remaining.map((item) => <ContinueCard key={item._id} item={item} onDismiss={onDismiss} />)}</Row>}
    {!luma.document.resumes.length && !remaining.length && <p className="rounded-2xl bg-elevated p-5 text-[14px] text-ink-muted">{t("Start a video and find your progress here next time.")}</p>}
    <Row title={t("My Watchlist")} min={150} scrollKey="home:mac:watchlist" headerRight={<button className="mac-secondary-button" onClick={() => setView("library")}>{t("My library")}</button>}>
      {watchlist.slice(0, 12).map((meta) => <PickCard key={meta.id} meta={meta} />)}
      {!watchlist.length && <button className="mac-secondary-button" onClick={() => setView("discover")}>{t("Find something to watch")}</button>}
    </Row>
    <Row title={t("Available offline")} min={240} shape="landscape" scrollKey="home:mac:offline" headerRight={<button className="mac-secondary-button" onClick={() => setView("downloads")}>{t("Open downloads")}</button>}>
      {downloads.map((d) => <button key={d.id} type="button" onClick={() => { void validatedDownloadSource(d).then((src) => { if (src) openPlayer(src); else setError(t("This file is missing or incomplete. Download it again from the title page.")); }); }} className="flex min-h-28 items-center gap-3 rounded-2xl bg-elevated p-4 text-start hover:bg-raised">
        {d.poster && <img src={d.poster} alt="" className="h-20 w-14 rounded-lg object-cover" loading="lazy" />}<span><span className="block text-[14px] font-semibold text-ink">{d.title}</span><span className="mt-1 block text-[12px] text-ink-muted">{d.subtitle || t("Watch offline")}</span></span>
      </button>)}
      {!downloads.length && <p className="py-3 text-[13px] text-ink-muted">{t("Downloaded videos will appear here.")}</p>}
    </Row>
    {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
  </section>;
}
