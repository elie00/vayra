import { Search, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

type Command = { id: string; label: string; run: () => void };

export function CommandPalette() {
  const t = useT();
  const view = useView();
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
    return [
      { id: "home", label: t("nav.home"), run: go(() => view.setView("home")) },
      { id: "discover", label: t("nav.discover"), run: go(() => view.setView("discover")) },
      { id: "movies", label: t("nav.movies"), run: go(() => view.setView("movies")) },
      { id: "shows", label: t("nav.shows"), run: go(() => view.setView("shows")) },
      { id: "anime", label: t("nav.anime"), run: go(() => view.setView("anime")) },
      { id: "live", label: t("nav.live"), run: go(() => view.setView("live")) },
      { id: "sports", label: t("nav.sports"), run: go(() => view.setView("sports")) },
      { id: "vod", label: t("nav.playlists"), run: go(() => view.setView("vod")) },
      { id: "calendar", label: t("nav.calendar"), run: go(() => view.setView("calendar")) },
      { id: "library", label: t("nav.library"), run: go(() => view.setView("library")) },
      { id: "downloads", label: t("nav.downloads"), run: go(() => view.setView("downloads")) },
      { id: "collections", label: t("Collections"), run: go(() => view.openCollections()) },
      { id: "queue", label: t("Discovery Queue"), run: go(() => view.openQueue()) },
      { id: "stats", label: t("Stats"), run: go(() => view.openStats()) },
      { id: "addons", label: t("nav.addons"), run: go(() => view.setView("addons")) },
      { id: "settings", label: t("nav.settings"), run: go(() => view.openSettings()) },
    ];
  }, [t, view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (sel >= filtered.length) setSel(filtered.length > 0 ? filtered.length - 1 : 0);
  }, [filtered.length, sel]);

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
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Command palette")}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-edge-soft bg-canvas shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-edge-soft px-4">
          <Search size={16} strokeWidth={1.9} className="shrink-0 text-ink-subtle" />
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
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={t("Command palette")}
          className="max-h-[50vh] overflow-y-auto py-1.5"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-ink-subtle">{t("No matches")}</div>
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
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors ${
                  i === sel ? "bg-elevated text-ink" : "text-ink-muted hover:bg-elevated/60"
                }`}
              >
                <span>{c.label}</span>
                {i === sel && <CornerDownLeft size={13} strokeWidth={1.9} className="text-ink-subtle" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
