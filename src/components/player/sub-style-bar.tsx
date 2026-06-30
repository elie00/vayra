import { Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ColorPopoverTrigger } from "@/views/settings/color-picker";
import { previewFamily } from "@/views/settings/player-panel/internals";
import { useSettings, type Settings } from "@/lib/settings";
import {
  closeStyleBar,
  loadSubPresets,
  saveSubPresets,
  snapshotSub,
  useStyleBarOpen,
  type SubPreset,
} from "@/lib/player/sub-presets";
import { useT } from "@/lib/i18n";

const SWATCHES = ["#FFFFFF", "#FFE45E", "#9AE6B4", "#93C5FD", "#FCA5A5", "#C4B5FD"];
const IDLE_MS = 7000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function SubStyleBar() {
  const t = useT();
  const open = useStyleBarOpen();
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStyleBar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let timer = window.setTimeout(closeStyleBar, IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(closeStyleBar, IDLE_MS);
    };
    window.addEventListener("pointermove", bump);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-7 pt-[68px] animate-in fade-in slide-in-from-top-2 duration-200">
      <div
        role="toolbar"
        aria-label={t("Subtitle appearance")}
        className="pointer-events-auto flex max-w-[calc(100vw-56px)] items-stretch gap-1.5 overflow-x-auto rounded-[14px] border border-edge bg-elevated px-1.5 py-1.5 shadow-[0_18px_44px_-22px_rgba(0,0,0,0.85)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <FontMenu value={settings.subFontFamily} fonts={settings.customFonts} onChange={(f) => update({ subFontFamily: f })} />
        <Divider />
        <SizeStepper value={settings.subFontSize} onChange={(n) => update({ subFontSize: clamp(n, 16, 120) })} />
        <Divider />
        <BoldToggle settings={settings} update={update} />
        <Divider />
        <ColorRow value={settings.subFontColor} onChange={(c) => update({ subFontColor: c })} portal />
        <Divider />
        <OutlineToggle settings={settings} update={update} />
        <Divider />
        <SpacingStepper value={settings.subLineSpacing ?? 0} onChange={(n) => update({ subLineSpacing: clamp(n, 0, 12) })} />
        <Divider />
        <PlacementPad settings={settings} update={update} />
        <Divider />
        <AssOverrideToggle settings={settings} update={update} />
        <Divider />
        <PresetCluster settings={settings} update={update} />
        <button
          type="button"
          onClick={closeStyleBar}
          aria-label={t("Done")}
          className="ms-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
        >
          <X size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="my-1 w-px shrink-0 self-stretch bg-edge-soft" />;
}

const BUILT_IN_FONTS: Array<{ id: string; label: string }> = [
  { id: "inter", label: "Inter" },
  { id: "system", label: "System" },
  { id: "rounded", label: "Rounded" },
  { id: "serif", label: "Serif" },
  { id: "arabic", label: "Arabic" },
];

function FontMenu({
  value,
  fonts,
  onChange,
}: {
  value: string;
  fonts: Settings["customFonts"];
  onChange: (f: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const items = [...BUILT_IN_FONTS, ...(fonts ?? []).map((f) => ({ id: `custom:${f.id}`, label: f.name }))];
  const current = items.find((i) => i.id === value) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: r.left });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 min-w-[124px] shrink-0 items-center justify-between gap-2 rounded-[10px] bg-raised px-3 text-[14px] font-semibold text-ink transition-colors hover:bg-elevated"
        style={{ fontFamily: previewFamily(value) }}
      >
        <span className="truncate">
          {current.id.startsWith("custom:") ? current.label : t(current.label)}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-subtle" />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[310]"
              onMouseDown={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              ref={menuRef}
              className="fixed z-[320] max-h-[min(60vh,380px)] w-[208px] overflow-y-auto rounded-[14px] border border-edge bg-elevated p-1.5 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.8)] backdrop-blur-md [scrollbar-width:thin]"
              style={{ top: pos.top, left: pos.left }}
            >
            {items.map((it) => {
              const active = it.id === value;
              return (
                <button
                  key={it.id}
                  onClick={() => {
                    onChange(it.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-[9px] px-3 py-2.5 text-start text-[15px] transition-colors ${
                    active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink"
                  }`}
                  style={{ fontFamily: previewFamily(it.id) }}
                >
                  <span className="truncate">
                    {it.id.startsWith("custom:") ? it.label : t(it.label)}
                  </span>
                  {active && <Check size={15} className="shrink-0 text-ink" />}
                </button>
              );
            })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function SizeStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  const drag = useRef({ active: false, startX: 0, startVal: 0 });
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, startX: e.clientX, startVal: value };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    onChange(Math.round(drag.current.startVal + (e.clientX - drag.current.startX) / 6));
  };
  const onUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current.active = false;
  };
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-px overflow-hidden rounded-[10px] bg-raised">
      <button aria-label={t("Smaller")} onClick={() => onChange(value - 1)} className="flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
        <span className="text-[13px] font-bold">A</span>
      </button>
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="flex min-w-[52px] cursor-ew-resize touch-none items-center justify-center px-2 font-mono text-[14px] tabular-nums text-ink"
      >
        {value}
      </button>
      <button aria-label={t("Larger")} onClick={() => onChange(value + 1)} className="flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
        <span className="text-[17px] font-bold">A</span>
      </button>
    </div>
  );
}

function ColorRow({ value, onChange, portal }: { value: string; onChange: (c: string) => void; portal?: boolean }) {
  const t = useT();
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 rounded-[10px] bg-raised px-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          aria-label={t("Subtitle color {color}", { color: c })}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
            value.toUpperCase() === c ? "ring-2 ring-ink" : "ring-1 ring-edge-soft"
          }`}
          style={{ background: c }}
        />
      ))}
      <ColorPopoverTrigger value={value} onChange={onChange} label="" direction="down" portal={portal} />
    </div>
  );
}

const OUTLINE_MODES: Array<{ id: "shadow" | "outline" | "box"; label: string }> = [
  { id: "shadow", label: "Shadow" },
  { id: "outline", label: "Outline" },
  { id: "box", label: "Box" },
];

function OutlineToggle({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const t = useT();
  const idx = Math.max(0, OUTLINE_MODES.findIndex((m) => m.id === settings.subStyle));
  const mode = OUTLINE_MODES[idx];
  return (
    <div className="flex h-11 shrink-0 items-stretch overflow-hidden rounded-[10px] bg-raised">
      <button
        onClick={() => update({ subStyle: OUTLINE_MODES[(idx + 1) % OUTLINE_MODES.length].id })}
        className="flex min-w-[78px] items-center justify-center px-3 text-[13px] font-semibold text-ink"
      >
        {t(mode.label)}
      </button>
      {settings.subStyle === "outline" && (
        <div className="flex items-stretch border-s border-edge-soft">
          <button aria-label={t("Thinner outline")} onClick={() => update({ subBorderSize: clamp(settings.subBorderSize - 1, 1, 6) })} className="flex w-7 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
            <Minus size={13} />
          </button>
          <button aria-label={t("Thicker outline")} onClick={() => update({ subBorderSize: clamp(Math.max(1, settings.subBorderSize) + 1, 1, 6) })} className="flex w-7 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function BoldToggle({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => update({ subBold: !settings.subBold })}
      aria-pressed={settings.subBold}
      aria-label={t("Bold")}
      title={t("Bold")}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[16px] font-bold transition-colors ${
        settings.subBold ? "bg-accent text-canvas" : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
      }`}
    >
      B
    </button>
  );
}

function SpacingStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div className="flex h-11 shrink-0 items-stretch overflow-hidden rounded-[10px] bg-raised">
      <button aria-label={t("Tighter spacing")} onClick={() => onChange(value - 1)} className="flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
        <Minus size={14} />
      </button>
      <span className="flex min-w-[40px] items-center justify-center font-mono text-[13px] tabular-nums text-ink-muted" title={t("Letter spacing")}>
        {value}
      </span>
      <button aria-label={t("Wider spacing")} onClick={() => onChange(value + 1)} className="flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
        <Plus size={14} />
      </button>
    </div>
  );
}

function PlacementPad({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const t = useT();
  const aligns: Array<"left" | "center" | "right"> = ["left", "center", "right"];
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-raised px-2">
      <div className="flex flex-col">
        <button aria-label={t("Raise subtitles")} onClick={() => update({ subMarginY: clamp(settings.subMarginY + 2, 0, 100) })} className="flex h-[18px] w-7 items-center justify-center text-ink-muted transition-colors hover:text-ink">
          <ChevronLeft size={13} className="rotate-90" />
        </button>
        <button aria-label={t("Lower subtitles")} onClick={() => update({ subMarginY: clamp(settings.subMarginY - 2, 0, 100) })} className="flex h-[18px] w-7 items-center justify-center text-ink-muted transition-colors hover:text-ink">
          <ChevronRight size={13} className="rotate-90" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        {aligns.map((a) => (
          <button
            key={a}
            aria-label={t("Align {dir}", { dir: t(a) })}
            onClick={() => update({ subAlignX: a })}
            className={`h-2 w-2 rounded-full transition-colors ${settings.subAlignX === a ? "bg-ink" : "bg-edge"}`}
          />
        ))}
      </div>
    </div>
  );
}

function AssOverrideToggle({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const t = useT();
  const on = settings.subAssOverride !== "no" && settings.subAssOverride !== "scale";
  return (
    <PresetTip
      label={
        on
          ? t("Your style is overriding the embedded subtitle's own styling")
          : t("Embedded subtitles keep their own styling. Click to force your style onto them.")
      }
    >
      <button
        type="button"
        onClick={() => update({ subAssOverride: on ? "no" : "force" })}
        aria-pressed={on}
        className={`flex h-11 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold transition-colors ${
          on ? "bg-accent text-canvas" : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
        }`}
      >
        <Layers size={15} strokeWidth={2.2} />
        {t("Override")}
      </button>
    </PresetTip>
  );
}

function styleMatches(s: Settings, p: SubPreset): boolean {
  const v = snapshotSub(s);
  return (Object.keys(p.values) as Array<keyof SubPreset["values"]>).every((k) => v[k] === p.values[k]);
}

function PresetCluster({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const t = useT();
  const [list, setList] = useState<SubPreset[]>(() => loadSubPresets());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = (next: SubPreset[]) => {
    setList(next);
    saveSubPresets(next);
  };

  useEffect(() => {
    if (selectedId && list.some((p) => p.id === selectedId)) return;
    const match = list.find((p) => styleMatches(settings, p));
    setSelectedId(match ? match.id : null);
  }, [list, selectedId, settings]);

  const selected = list.find((p) => p.id === selectedId) ?? null;
  const dirty = selected ? !styleMatches(settings, selected) : false;
  const isSaved = !!selected && !dirty;

  const apply = (p: SubPreset) => {
    update(p.values);
    setSelectedId(p.id);
  };
  const overrideSelected = () => {
    if (!selected) return;
    commit(list.map((p) => (p.id === selected.id ? { ...p, values: snapshotSub(settings) } : p)));
  };
  const startCreate = () => {
    setDraft("");
    setNaming(true);
  };
  const createNamed = () => {
    const name = draft.trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/\s+/g, "-").slice(0, 24)}-${list.length}`;
    commit([...list, { id, name, values: snapshotSub(settings) }]);
    setSelectedId(id);
    setDraft("");
    setNaming(false);
  };

  if (naming) {
    return (
      <div className="flex h-11 shrink-0 items-center gap-1 rounded-[10px] bg-raised px-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createNamed();
            if (e.key === "Escape") {
              setNaming(false);
              setDraft("");
            }
          }}
          placeholder={list.length ? t("New template name") : t("Name your first template")}
          className="h-8 w-[156px] rounded-[8px] bg-elevated px-2.5 text-[13px] text-ink outline-none ring-1 ring-edge placeholder:text-ink-subtle focus:ring-ink"
        />
        <button
          onClick={createNamed}
          disabled={!draft.trim()}
          className={`ms-0.5 flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[13px] font-semibold transition-colors ${
            draft.trim() ? "bg-accent text-canvas hover:brightness-110" : "cursor-default text-ink-subtle/50"
          }`}
        >
          <Check size={13} strokeWidth={2.6} />
          {t("Save")}
        </button>
        <button
          onClick={() => {
            setNaming(false);
            setDraft("");
          }}
          aria-label={t("Cancel")}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 rounded-[10px] bg-raised px-1.5">
      {list.map((p) => {
        const isSel = p.id === selectedId;
        const matches = styleMatches(settings, p);
        return (
          <PresetTip key={p.id} label={t("Click to apply · Right-click to delete")}>
            <button
              onClick={() => apply(p)}
              onContextMenu={(e) => {
                e.preventDefault();
                commit(list.filter((x) => x.id !== p.id));
                if (selectedId === p.id) setSelectedId(null);
              }}
              className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-semibold transition-colors ${
                matches
                  ? "bg-elevated text-ink ring-1 ring-edge"
                  : isSel
                    ? "bg-elevated/60 text-ink"
                    : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
              }`}
            >
              {p.name}
              {isSel && dirty && <span aria-label={t("unsaved changes")} className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </button>
          </PresetTip>
        );
      })}

      {list.length > 0 && <span aria-hidden className="mx-0.5 h-5 w-px bg-edge-soft" />}

      <button
        onClick={selected ? (dirty ? overrideSelected : undefined) : startCreate}
        disabled={isSaved}
        title={
          selected
            ? dirty
              ? t("Overwrite {name} with this look", { name: selected.name })
              : t("No unsaved changes")
            : t("Save this look as a template")
        }
        className={`flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold transition-all ${
          isSaved ? "cursor-default text-ink-subtle/55" : "bg-accent text-canvas hover:brightness-110"
        }`}
      >
        {isSaved || selected ? <Check size={13} strokeWidth={2.6} /> : <Plus size={14} strokeWidth={2.6} />}
        {isSaved ? t("Saved") : selected ? t("Override {name}", { name: selected.name }) : t("Save look")}
      </button>

      {selected && (
        <PresetTip label={t("Save as a new template")}>
          <button
            onClick={startCreate}
            aria-label={t("Save as a new template")}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <Plus size={16} />
          </button>
        </PresetTip>
      )}
    </div>
  );
}

function PresetTip({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.top - 8, left: r.left + r.width / 2 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[330] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[12px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
