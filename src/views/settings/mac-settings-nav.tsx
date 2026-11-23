import { useState, type ComponentType } from "react";
import { ArrowLeft, ChevronRight, Download, Puzzle, Search, Shield, X } from "lucide-react";
import { APP_VERSION } from "@/lib/build-info";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { NAV_GROUPS, SETTINGS_OPTIONS } from "./nav";
import { settingsAnchor, type SectionId } from "./shared";

// Essentials first (matching the desktop landing view), followed by deeper options.
export const MAC_SETTINGS_GROUPS: { id: SectionId; label: string; children: SectionId[]; cluster: "essentials" | "more" }[] = [
  { id: "basics", label: "Overview", children: [], cluster: "essentials" },
  { id: "account", label: "Account", children: [], cluster: "essentials" },
  { id: "theme", label: "Appearance", children: [], cluster: "essentials" },
  { id: "language", label: "Languages", children: [], cluster: "essentials" },
  { id: "player", label: "Playback", children: ["mpv", "anime", "playerLayout", "hotkeys"], cluster: "more" },
  { id: "downloads", label: "Downloads", children: [], cluster: "more" },
  { id: "connections", label: "Extensions and connections", children: ["library", "streaming", "trakt", "anilist", "mal", "simkl", "letterboxd", "cira"], cluster: "more" },
  { id: "privacy", label: "Privacy and backups", children: [], cluster: "more" },
  { id: "advanced", label: "Advanced", children: ["streamFilters", "p2p", "relay", "webhooks", "bug"], cluster: "more" },
];

const allItems = NAV_GROUPS.flatMap((g) => g.items);
const sectionLabels = new Map<SectionId, string>(allItems.map((it) => [it.id, it.label]));
const sectionIcons = new Map<SectionId, ComponentType<{ size?: number; strokeWidth?: number }>>(
  allItems.map((it) => [it.id, it.Icon]),
);

function GroupIcon({ id }: { id: SectionId }) {
  if (id === "downloads") return <Download size={16} strokeWidth={1.85} aria-hidden="true" />;
  if (id === "connections") return <Puzzle size={16} strokeWidth={1.85} aria-hidden="true" />;
  if (id === "privacy") return <Shield size={16} strokeWidth={1.85} aria-hidden="true" />;
  const Icon = sectionIcons.get(id);
  return Icon ? <Icon size={16} strokeWidth={1.8} /> : null;
}

export function MacSettingsNav({ active, onChange }: { active: SectionId; onChange: (id: SectionId, anchor?: string) => void }) {
  const t = useT();
  const { goBack, canGoBack, setView } = useView();
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const q = query.trim().toLocaleLowerCase();
  const matches = q
    ? SETTINGS_OPTIONS.filter((o) =>
        [t(o.label), o.label, ...(o.keywords ?? [])].some((s) => s.toLocaleLowerCase().includes(q)),
      ).slice(0, 30)
    : [];
  const safeHighlight = matches.length > 0 ? Math.min(highlightIdx, matches.length - 1) : 0;

  const openMatch = (m: (typeof matches)[number]) => {
    onChange(m.section, settingsAnchor(t(m.anchorTitle ?? m.label)));
    setQuery("");
    setHighlightIdx(0);
  };

  return (
    <nav
      aria-label={t("Settings")}
      className="flex w-[264px] shrink-0 flex-col gap-4 border-e border-edge-soft/45 bg-canvas px-3.5 pb-5 pt-16 max-sm:hidden"
    >
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => (canGoBack ? goBack() : setView("home"))}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-edge-soft/70 bg-surface/80 px-3 text-[13px] font-medium text-ink-muted transition-[color,background-color,border-color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={2.2} className="dir-icon" />
          <span>{t("Back")}</span>
        </button>
        <span className="vayra-kicker pe-1">{t("Settings")}</span>
      </div>

      <div className="flex h-10 items-center gap-2 rounded-xl border border-edge-soft/75 bg-surface/90 px-3 text-ink-subtle transition-colors focus-within:border-edge">
        <Search size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIdx(0);
          }}
          placeholder={t("Search settings")}
          aria-label={t("Search settings")}
          className="min-w-0 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setHighlightIdx(0);
            } else if (e.key === "ArrowDown" && matches.length > 0) {
              e.preventDefault();
              setHighlightIdx((i) => (i + 1) % matches.length);
            } else if (e.key === "ArrowUp" && matches.length > 0) {
              e.preventDefault();
              setHighlightIdx((i) => (i - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter" && matches[safeHighlight]) {
              e.preventDefault();
              openMatch(matches[safeHighlight]);
            }
          }}
        />
        {q && matches.length > 0 && (
          <span className="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-subtle">
            {matches.length}
          </span>
        )}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHighlightIdx(0);
            }}
            aria-label={t("Clear")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pe-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {q ? (
          <>
            {matches.length === 0 && (
              <p className="rounded-xl border border-edge-soft/60 bg-surface/70 p-3.5 text-[13px] text-ink-muted">
                {t("No matching settings")}
              </p>
            )}
            {matches.map((m, i) => (
              <button
                key={`${m.section}-${i}`}
                type="button"
                onClick={() => openMatch(m)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`flex min-h-11 flex-col justify-center rounded-xl px-3 py-2 text-start transition-colors ${
                  i === safeHighlight ? "bg-elevated text-ink" : "hover:bg-elevated/70"
                }`}
              >
                <span className="truncate text-[13px] font-medium text-ink">{t(m.label)}</span>
                <span className="truncate text-[11px] text-ink-subtle">
                  {t(sectionLabels.get(m.section) ?? m.section)}
                </span>
              </button>
            ))}
          </>
        ) : (
          MAC_SETTINGS_GROUPS.map((group, idx) => {
            const selected = group.id === active || group.children.includes(active);
            const exact = group.id === active;
            const prevCluster = idx > 0 ? MAC_SETTINGS_GROUPS[idx - 1].cluster : null;
            const showClusterHeading = prevCluster !== group.cluster;
            return (
              <div key={group.id} className="flex flex-col">
                {showClusterHeading && (
                  <span className={`vayra-kicker px-3 ${idx === 0 ? "pb-1.5 pt-0.5" : "pb-1.5 pt-4"}`}>
                    {t(group.cluster === "essentials" ? "Essentials" : "More options")}
                  </span>
                )}
                <button
                  type="button"
                  aria-current={exact ? "page" : undefined}
                  aria-expanded={group.children.length > 0 ? selected : undefined}
                  onClick={() => onChange(group.id)}
                  className={`group/snav relative flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[13.5px] tracking-[-0.005em] transition-[background-color,color] duration-150 ${
                    selected
                      ? "bg-elevated/85 font-medium text-ink"
                      : "font-normal text-ink-muted hover:bg-elevated/50 hover:text-ink"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute start-0 top-1/2 w-[2.5px] -translate-y-1/2 rounded-full bg-ink transition-[height,opacity] duration-200 motion-reduce:transition-none ${
                      exact ? "h-4.5 opacity-100" : "h-0 opacity-0"
                    }`}
                  />
                  <span
                    className={`inline-flex shrink-0 transition-colors ${
                      selected ? "text-ink" : "text-ink-subtle group-hover/snav:text-ink-muted"
                    }`}
                  >
                    <GroupIcon id={group.id} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t(group.label)}</span>
                  {group.children.length > 0 && (
                    <ChevronRight
                      size={13}
                      strokeWidth={2.2}
                      className={`shrink-0 text-ink-subtle transition-transform duration-150 motion-reduce:transition-none ${
                        selected ? "rotate-90 text-ink-muted" : ""
                      }`}
                    />
                  )}
                </button>
                {selected && group.children.length > 0 && (
                  <div className="mt-1 mb-1 ms-[19px] flex flex-col gap-0.5 border-s border-edge-soft/55 ps-2.5">
                    {group.children.map((id) => {
                      const item = allItems.find((it) => it.id === id);
                      if (!item) return null;
                      const childActive = id === active;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-current={childActive ? "page" : undefined}
                          onClick={() => onChange(id)}
                          className={`relative flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-[12.5px] transition-[background-color,color] duration-150 ${
                            childActive
                              ? "bg-elevated/75 font-medium text-ink"
                              : "text-ink-muted hover:bg-elevated/45 hover:text-ink"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute start-0 top-1/2 w-[2px] -translate-y-1/2 rounded-full bg-ink transition-[height,opacity] duration-200 motion-reduce:transition-none ${
                              childActive ? "h-3.5 opacity-100" : "h-0 opacity-0"
                            }`}
                          />
                          <span className="truncate">{t(item.label)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-edge-soft/55 px-2 pt-3">
        <p className="text-[11px] font-medium tabular-nums text-ink-subtle/80">VAYRA · v{APP_VERSION}</p>
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-subtle/80">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success/80" />
          {t("Saved")}
        </span>
      </div>
    </nav>
  );
}
