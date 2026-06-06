import { Check, FolderOpen, Loader2, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import type { TrackInfo } from "@/lib/player/bridge";
import { languageName } from "@/lib/subtitles/language";
import { DelayRow } from "./delay-row";
import { SearchSection } from "./search-section";
import type { SubtitleMenuProps } from "./types";
import { groupByLang, isVeryNewRelease } from "./utils";

type SourceFilter = "all" | "embedded" | "external";

export function MenuBody(props: SubtitleMenuProps & { onClose: () => void }) {
  const { tracks, selectedId, onSelect, onClose, delaySec, onDelay, metaReleaseDate, onOpenStyleBar } = props;
  const groups = useMemo(() => groupByLang(tracks), [tracks]);
  const [searchSettled, setSearchSettled] = useState(false);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hideHI, setHideHI] = useState(false);
  const [forcedOnly, setForcedOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (tracks.length > 0) return;
    setSearchSettled(false);
    const t = setTimeout(() => setSearchSettled(true), 9000);
    return () => clearTimeout(t);
  }, [tracks.length]);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveLang(null);
      return;
    }
    if (!activeLang || !groups.some((g) => g.langKey === activeLang)) {
      const sel = groups.find((g) => g.variants.some((v) => v.id === selectedId));
      setActiveLang(sel?.langKey ?? groups[0].langKey);
    }
  }, [groups, activeLang, selectedId]);

  const veryNewMovie = useMemo(() => isVeryNewRelease(metaReleaseDate), [metaReleaseDate]);
  const activeGroup = useMemo(
    () => groups.find((g) => g.langKey === activeLang) ?? null,
    [groups, activeLang],
  );
  const visibleVariants = useMemo(() => {
    const list = activeGroup?.variants ?? [];
    return list.filter((t) => {
      if (sourceFilter === "embedded" && t.external) return false;
      if (sourceFilter === "external" && !t.external) return false;
      if (hideHI && t.hearingImpaired) return false;
      if (forcedOnly && !t.forced) return false;
      return true;
    });
  }, [activeGroup, sourceFilter, hideHI, forcedOnly]);

  const totalEmbedded = tracks.filter((t) => !t.external).length;
  const totalExternal = tracks.filter((t) => t.external).length;
  const offSelected = selectedId == null;
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [localError, setLocalError] = useState<string | null>(null);

  const loadLocal = async () => {
    setLocalError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "vtt", "sub"] }],
      });
      if (typeof path !== "string") return;
      const name = path.split(/[\\/]/).pop() || "Local subtitle";
      const ok = await props.onAddSubtitle(path, undefined, name);
      if (ok === false) {
        setLocalError("Couldn't load that subtitle file. Try another.");
        return;
      }
      onClose();
    } catch (e) {
      console.warn("[subtitles] local load failed", e);
      setLocalError("Couldn't load that subtitle file. Try another.");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-edge-soft px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13.5px] font-semibold text-ink">Subtitles</span>
          {tracks.length > 0 && (
            <span className="text-[11.5px] tabular-nums text-ink-subtle">
              {tracks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onOpenStyleBar && (
            <button
              type="button"
              onClick={() => {
                onOpenStyleBar();
                onClose();
              }}
              aria-label="Subtitle appearance"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[128px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-edge-soft bg-canvas/30 p-2">
          <button
            onClick={() => {
              if (offSelected) return;
              onSelect(null);
              onClose();
            }}
            disabled={offSelected}
            className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors ${
              offSelected
                ? "text-ink-subtle"
                : "bg-elevated text-ink ring-1 ring-edge hover:bg-raised"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                offSelected ? "bg-raised text-ink-subtle" : "bg-accent text-canvas"
              }`}
            >
              {offSelected ? null : <Check size={9} strokeWidth={3} />}
            </span>
            {offSelected ? "Off" : "On"}
          </button>

          {groups.length > 0 && (
            <div className="mt-1.5 mb-0.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              Languages
            </div>
          )}
          {groups.map((g) => {
            const isActive = activeLang === g.langKey;
            const hasSelected = g.variants.some((v) => v.id === selectedId);
            return (
              <button
                key={g.langKey}
                onClick={() => setActiveLang(g.langKey)}
                className={`group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                  isActive
                    ? "bg-elevated text-ink ring-1 ring-edge"
                    : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                }`}
              >
                <Flag language={g.langDisplay} size="sm" showLabel={false} />
                <span className="flex-1 truncate font-medium">{g.langDisplay}</span>
                {hasSelected && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                <span className="text-[10.5px] tabular-nums text-ink-subtle">
                  {g.variants.length}
                </span>
              </button>
            );
          })}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!searchOpen && tracks.length > 0 && activeGroup && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-edge-soft bg-canvas/15 px-3 py-2">
              <Tab
                active={sourceFilter === "all"}
                onClick={() => setSourceFilter("all")}
              >
                All <Count value={tracks.length} />
              </Tab>
              <Tab
                active={sourceFilter === "embedded"}
                onClick={() => setSourceFilter("embedded")}
                disabled={totalEmbedded === 0}
              >
                Embedded <Count value={totalEmbedded} />
              </Tab>
              <Tab
                active={sourceFilter === "external"}
                onClick={() => setSourceFilter("external")}
                disabled={totalExternal === 0}
              >
                External <Count value={totalExternal} />
              </Tab>
              <span className="ml-auto flex items-center gap-1">
                <ToggleChip
                  active={!hideHI}
                  onClick={() => setHideHI((v) => !v)}
                  label="HI"
                  hint={hideHI ? "Hidden" : "Shown"}
                />
                <ToggleChip
                  active={forcedOnly}
                  onClick={() => setForcedOnly((v) => !v)}
                  label="Forced"
                />
              </span>
            </div>
          )}

          {searchOpen ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <SearchSection {...props} />
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto">
            {tracks.length === 0 ? (
              <EmptyState searchSettled={searchSettled} veryNewMovie={veryNewMovie} />
            ) : visibleVariants.length === 0 ? (
              <p className="px-5 py-6 text-[13.5px] text-ink-muted">
                No tracks match these filters. Try toggling HI/SDH or Forced.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5 p-2">
                {visibleVariants.map((t) => (
                  <VariantRow
                    key={t.id}
                    track={t}
                    selected={t.id === selectedId}
                    onPick={() => {
                      onSelect(t.id);
                      onClose();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          )}

          {localError && (
            <div className="shrink-0 border-t border-edge-soft bg-danger/10 px-3 py-1.5 text-[11.5px] text-danger">
              {localError}
            </div>
          )}
          <div className="flex shrink-0 items-stretch border-t border-edge-soft">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas/40 hover:text-ink"
            >
              <SearchIcon size={12} strokeWidth={2.2} />
              {searchOpen ? "Hide search" : "Find more subtitles"}
            </button>
            {isTauri && (
              <button
                onClick={() => void loadLocal()}
                title="Load a subtitle file from your computer"
                className="flex shrink-0 items-center gap-2 border-l border-edge-soft px-3 py-2 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas/40 hover:text-ink"
              >
                <FolderOpen size={12} strokeWidth={2.2} />
                Load file
              </button>
            )}
          </div>

          <DelayRow delay={delaySec} onDelay={onDelay} />
        </section>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${
        active
          ? "bg-elevated text-ink ring-1 ring-edge"
          : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ value }: { value: number }) {
  return <span className="text-[11.5px] tabular-nums text-ink-subtle">{value}</span>;
}

function ToggleChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={`flex h-6 items-center rounded-full px-2 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-accent text-canvas"
          : "bg-raised text-ink-muted hover:bg-elevated"
      }`}
    >
      {label}
    </button>
  );
}

function VariantRow({
  track,
  selected,
  onPick,
}: {
  track: TrackInfo;
  selected: boolean;
  onPick: () => void;
}) {
  const tags: { label: string; tone: "warn" | "info" | "default" }[] = [];
  if (track.forced) tags.push({ label: "Forced", tone: "info" });
  if (track.hearingImpaired) tags.push({ label: "HI/SDH", tone: "warn" });
  if (track.default) tags.push({ label: "Default", tone: "default" });
  const sourceLabel = track.external ? "External" : "Embedded";
  const codec = track.codec?.toUpperCase();
  const release = pickReleaseHint(track);
  const titleText = track.title?.trim() || (track.external ? "External subtitle" : "Embedded track");
  const langName = track.lang ? languageName(track.lang) : "Unknown";

  return (
    <button
      onClick={onPick}
      className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
        selected
          ? "bg-elevated ring-1 ring-edge"
          : "hover:bg-canvas/55"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-accent text-canvas" : "bg-raised text-ink-subtle"
        }`}
        aria-hidden
      >
        {selected ? <Check size={9} strokeWidth={3} /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[12.5px] font-medium leading-snug text-ink">
          {titleText}
        </p>
        {release && (
          <p className="truncate font-mono text-[10.5px] leading-snug text-ink-muted">{release}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-subtle">
          <span className="font-semibold uppercase tracking-[0.1em]">{langName}</span>
          <span aria-hidden>·</span>
          <span>{sourceLabel}</span>
          {codec && (
            <>
              <span aria-hidden>·</span>
              <span>{codec}</span>
            </>
          )}
          {tags.map((t) => (
            <span
              key={t.label}
              className={`rounded px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${
                t.tone === "warn"
                  ? "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30"
                  : t.tone === "info"
                    ? "bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/30"
                    : "bg-raised text-ink-muted ring-1 ring-edge-soft"
              }`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function pickReleaseHint(track: TrackInfo): string | null {
  const t = track.title;
  if (!t) return null;
  const trimmed = t.trim();
  if (!trimmed) return null;
  if (/\.(srt|vtt|ass|ssa|sub)$/i.test(trimmed)) return trimmed;
  if (/[-.][A-Z0-9]{2,}/.test(trimmed)) return trimmed;
  if (trimmed.length > 24) return trimmed;
  return null;
}

function EmptyState({ searchSettled, veryNewMovie }: { searchSettled: boolean; veryNewMovie: boolean }) {
  if (!searchSettled) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-6 text-[13.5px] text-ink-muted">
        <Loader2 size={14} className="animate-spin text-ink-subtle" />
        Looking for subtitles…
      </div>
    );
  }
  if (veryNewMovie) {
    return (
      <div className="flex flex-col gap-1.5 px-5 py-6 text-[13.5px] leading-snug text-ink-muted">
        <span className="text-[14px] font-semibold text-ink">Movie's too new</span>
        <span>Subtitles haven't been published yet. Try search below or check back in a few days.</span>
      </div>
    );
  }
  return (
    <p className="px-5 py-6 text-[13.5px] text-ink-muted">
      No subtitles found yet. Try the search at the bottom.
    </p>
  );
}
