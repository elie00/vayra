import { ArrowUpRight, CornerDownLeft, Play, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emitAppFeedback } from "@/lib/app-feedback";
import { rankCommands } from "@/lib/command-search";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useT } from "@/lib/i18n";
import { lumaStore, useLuma, type LumaResumeEntry } from "@/lib/luma";
import { resolveLumaResumeTarget } from "@/lib/luma/resume-target";
import { useSearch } from "@/lib/search-context";
import { useView } from "@/lib/view";
import { currentPlatformCapabilities } from "@/lib/platform-capabilities";

const CAPABILITIES = currentPlatformCapabilities();

type Command = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  kind: "resume" | "search" | "navigation";
  run: () => void;
};

function resumeDescription(
  entry: LumaResumeEntry,
  translate: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const episode = entry.ref.episode;
  const episodeLabel = episode ? `S${episode.season} · E${String(episode.episode).padStart(2, "0")}` : null;
  const seconds = Math.max(0, Math.ceil((entry.durationMs - entry.positionMs) / 1000));
  let remaining: string | null = null;
  if (seconds > 0 && seconds < 60) remaining = translate("{s}s left", { s: seconds });
  else if (seconds >= 60 && seconds < 3600) remaining = translate("{m}m left", { m: Math.ceil(seconds / 60) });
  else if (seconds >= 3600) {
    const minutes = Math.ceil(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    remaining = rest
      ? translate("{h}h {m}m left", { h: hours, m: rest })
      : translate("{h}h left", { h: hours });
  }
  return [episodeLabel, entry.presentation.episodeTitle, remaining, translate("Local only")]
    .filter(Boolean)
    .join(" · ");
}

export function CommandPalette() {
  const t = useT();
  const view = useView();
  const search = useSearch();
  const luma = useLuma();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Ouverture globale via Cmd+K (macOS) / Ctrl+K (Windows/Linux).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const commands: Command[] = useMemo(() => {
    const go = (run: () => void) => () => {
      run();
      setOpen(false);
    };
    const resume = luma.document.resumes[0];
    const navigation = (id: string, label: string, run: () => void, keywords: string[] = []): Command => ({
      id,
      label,
      keywords,
      kind: "navigation",
      run: go(run),
    });
    return [
      ...(resume
        ? [{
            id: "luma-resume",
            label: t("Resume {title} with LUMA", { title: resume.presentation.title }),
            description: resumeDescription(resume, t),
            keywords: ["resume", "continue", "watch", "play", "luma", resume.presentation.title],
            kind: "resume" as const,
            run: go(() => {
              const target = resolveLumaResumeTarget(resume);
              if (target.kind === "missing-local") {
                lumaStore().clearResume(resume.id);
                emitAppFeedback({ kind: "info", text: t("This local file is no longer in your library.") });
              } else if (target.kind === "local") {
                view.openPlayer(target.player);
              } else {
                view.openPicker(target.meta, target.episode, { autoPlay: true, resume: true });
              }
            }),
          }]
        : []),
      {
        id: "global-search",
        label: t("common.search"),
        description: t("search.placeholder"),
        keywords: ["find", "movie", "show", "person", "addon"],
        kind: "search" as const,
        run: go(() => {
          search.clear();
          search.setOpen(true);
        }),
      },
      navigation("home", t("nav.home"), () => view.setView("home"), ["start"]),
      navigation("discover", t("nav.discover"), () => view.setView("discover"), ["browse", "explore"]),
      navigation("movies", t("nav.movies"), () => view.setView("movies"), ["film", "cinema"]),
      navigation("shows", t("nav.shows"), () => view.setView("shows"), ["series", "tv"]),
      navigation("anime", t("nav.anime"), () => view.setView("anime")),
      navigation("live", t("nav.live"), () => view.setView("live"), ["channel", "iptv"]),
      navigation("sports", t("nav.sports"), () => view.setView("sports"), ["match", "game"]),
      navigation("vod", t("nav.playlists"), () => view.setView("vod")),
      navigation("calendar", t("nav.calendar"), () => view.setView("calendar"), ["schedule"]),
      navigation("library", t("nav.library"), () => view.setView("library"), ["saved", "local"]),
      ...(CAPABILITIES.nativeDownloads
        ? [navigation("downloads", t("nav.downloads"), () => view.setView("downloads"), ["offline"])]
        : []),
      navigation("collections", t("Collections"), () => view.openCollections(), ["saved"]),
      navigation("queue", t("Discovery Queue"), () => view.openQueue(), ["next"]),
      navigation("stats", t("Stats"), () => view.openStats(), ["history", "activity"]),
      navigation("addons", t("nav.addons"), () => view.setView("addons"), ["extensions"]),
      navigation("settings", t("nav.settings"), () => view.openSettings(), ["preferences", "options"]),
    ];
  }, [luma.document.resumes, search, t, view]);

  const filtered = useMemo(() => {
    return rankCommands(commands, query);
  }, [commands, query]);

  useEffect(() => {
    if (sel >= filtered.length) setSel(filtered.length > 0 ? filtered.length - 1 : 0);
  }, [filtered.length, sel]);

  useEffect(() => {
    const option = filtered[sel];
    if (!open || !option) return;
    document.getElementById(`cmdp-opt-${option.id}`)?.scrollIntoView({ block: "nearest" });
  }, [filtered, open, sel]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (filtered.length ? (s + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (filtered.length ? (s - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[sel]?.run();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/55 px-4 pt-[10dvh] backdrop-blur-md"
      onMouseDown={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Command palette")}
        className="w-full max-w-[38rem] overflow-hidden rounded-[1.4rem] border border-edge-soft bg-canvas/92 shadow-[0_32px_90px_-32px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-edge-soft px-5">
          <Search size={17} strokeWidth={1.9} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            placeholder={t("Jump to…")}
            aria-label={t("Jump to…")}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[sel] ? `cmdp-opt-${filtered[sel].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
          <kbd className="hidden rounded-md border border-edge-soft bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle sm:block">esc</kbd>
        </div>
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={t("Command palette")}
          className="max-h-[54dvh] overflow-y-auto p-2"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-ink-subtle">{t("No matches")}</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                id={`cmdp-opt-${c.id}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => c.run()}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.995] ${
                  i === sel ? "bg-raised text-ink" : "text-ink-muted hover:bg-elevated/70"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] border ${
                  c.kind === "resume"
                    ? "border-accent/30 bg-accent/12 text-accent"
                    : c.kind === "search"
                      ? "border-edge bg-elevated text-ink"
                      : "border-edge-soft bg-surface text-ink-subtle"
                }`}>
                  {c.kind === "resume" ? <Play size={14} fill="currentColor" /> : c.kind === "search" ? <Search size={14} /> : <ArrowUpRight size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-current">{c.label}</span>
                  {c.description ? <span className="mt-0.5 block truncate text-[11.5px] font-normal text-ink-subtle">{c.description}</span> : null}
                </span>
                {i === sel && <CornerDownLeft size={14} strokeWidth={1.9} className="shrink-0 text-ink-subtle" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-edge-soft px-5 py-2 text-[10.5px] text-ink-subtle">
          <span className="font-medium tracking-wide">VAYRA COMMAND</span>
          <span className="flex items-center gap-3 font-mono"><span>↑↓</span><span>↵</span></span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
