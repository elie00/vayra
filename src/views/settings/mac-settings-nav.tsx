import { useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { NAV_GROUPS, SETTINGS_OPTIONS } from "./nav";
import { settingsAnchor, type SectionId } from "./shared";

export const MAC_SETTINGS_GROUPS: { id: SectionId; label: string; children: SectionId[] }[] = [
  { id: "basics", label: "Overview", children: [] },
  { id: "player", label: "Playback", children: ["mpv", "anime", "playerLayout", "hotkeys"] },
  { id: "language", label: "Languages", children: [] },
  { id: "theme", label: "Appearance", children: [] },
  { id: "downloads", label: "Downloads", children: [] },
  { id: "connections", label: "Extensions and connections", children: ["account", "library", "streaming", "trakt", "anilist", "mal", "simkl", "letterboxd", "cira"] },
  { id: "privacy", label: "Privacy and backups", children: [] },
  { id: "advanced", label: "Advanced", children: ["streamFilters", "p2p", "relay", "webhooks", "bug"] },
];
const allItems = NAV_GROUPS.flatMap((g) => g.items);

export function MacSettingsNav({ active, onChange }: { active: SectionId; onChange: (id: SectionId, anchor?: string) => void }) {
  const t = useT();
  const { goBack, canGoBack, setView } = useView();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const matches = q ? SETTINGS_OPTIONS.filter((o) => [t(o.label), o.label, ...(o.keywords ?? [])].some((s) => s.toLocaleLowerCase().includes(q))).slice(0, 30) : [];
  return <nav aria-label={t("Settings")} className="flex w-64 shrink-0 flex-col gap-5 border-e border-edge-soft bg-canvas px-4 pb-6 pt-24 max-sm:hidden">
    <button type="button" onClick={() => canGoBack ? goBack() : setView("home")} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[14px] font-medium text-ink hover:bg-elevated"><ArrowLeft size={17} />{t("Back")}</button>
    <label className="flex min-h-11 items-center gap-2 rounded-xl bg-elevated px-3 text-ink-subtle"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search settings")} aria-label={t("Search settings")} className="min-w-0 w-full bg-transparent text-[13px] text-ink outline-none" onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); if (e.key === "Enter" && matches[0]) { const m = matches[0]; onChange(m.section, settingsAnchor(t(m.anchorTitle ?? m.label))); setQuery(""); } }} /></label>
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      {q ? <>{matches.length === 0 && <p className="p-3 text-[13px] text-ink-muted">{t("No matching settings")}</p>}{matches.map((m, i) => <button key={`${m.section}-${i}`} type="button" onClick={() => { onChange(m.section, settingsAnchor(t(m.anchorTitle ?? m.label))); setQuery(""); }} className="min-h-11 rounded-xl px-3 py-2 text-start text-[13px] text-ink-muted hover:bg-elevated">{t(m.label)}</button>)}</> : MAC_SETTINGS_GROUPS.map((group) => {
        const selected = group.id === active || group.children.includes(active);
        return <div key={group.id}>
          <button type="button" aria-current={group.id === active ? "page" : undefined} onClick={() => onChange(group.id)} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-[14px] font-medium ${selected ? "bg-elevated text-ink" : "text-ink-muted hover:bg-elevated/60"}`}><span>{t(group.label)}</span>{group.children.length > 0 && <ChevronRight size={14} className={selected ? "rotate-90" : ""} />}</button>
          {selected && group.children.map((id) => { const item = allItems.find((it) => it.id === id); return item && <button key={id} type="button" aria-current={id === active ? "page" : undefined} onClick={() => onChange(id)} className={`my-0.5 min-h-11 w-full rounded-lg ps-6 pe-3 text-start text-[13px] ${id === active ? "text-accent bg-elevated/50" : "text-ink-muted hover:bg-elevated/50"}`}>{t(item.label)}</button>; })}
        </div>;
      })}
    </div>
  </nav>;
}
