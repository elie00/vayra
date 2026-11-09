import { useState, type ReactNode } from "react";
import { ChevronDown, Download, Gauge, ListVideo, Moon, PictureInPicture2, Replace, Scan, SkipBack, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SLEEP_PRESETS } from "@/views/player/hooks/use-sleep-timer";
import type { ControlContext } from "./transport/control-renderer";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// The picture modes ExoPlayer can render on a phone.
const PICTURE_MODES: { id: string; label: string }[] = [
  { id: "fit", label: "Fit" },
  { id: "fill", label: "Fill" },
  { id: "stretch", label: "Stretch" },
];

/**
 * The phone player's "more options", as a sheet of labelled rows instead of a
 * row of bare icons: speed, sleep timer, picture, another source, previous
 * episode, download, picture in picture and LUMA. A bottom sheet in portrait,
 * a side sheet in landscape, so the picture stays in view.
 */
export function MobileMoreSheet({ ctx, onClose }: { ctx: ControlContext; onClose: () => void }) {
  const t = useT();
  const [open, setOpen] = useState<"speed" | "sleep" | "picture" | null>(null);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const toggle = (id: "speed" | "sleep" | "picture") => setOpen((v) => (v === id ? null : id));
  const sleep = ctx.sleep;
  const sleepLabel = !sleep || sleep.mode.kind === "off" ? t("Off") : sleep.remainingMs != null ? `${Math.ceil(sleep.remainingMs / 60000)} min` : t("On");
  const download = ctx.download;
  const live = ctx.isLiveChannel;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60]">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="vayra-scrim absolute inset-0 bg-black/50" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("More options")}
        className="vayra-sheet absolute inset-x-0 bottom-0 flex max-h-[75%] flex-col rounded-t-[28px] bg-elevated pb-[var(--vayra-safe-bottom,0px)] text-ink landscape:inset-y-0 landscape:start-auto landscape:w-[min(380px,45%)] landscape:max-h-none landscape:rounded-none landscape:rounded-s-[28px]"
      >
        <header className="flex h-16 shrink-0 items-center justify-between ps-6 pe-2">
          <h2 className="type-title-3 font-semibold">{t("More options")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-12 w-12 items-center justify-center rounded-full active:bg-raised">
            <X size={22} />
          </button>
        </header>
        <div className="min-h-0 grow basis-0 overflow-y-auto overscroll-contain pb-3">
          {!live && (
            <Row icon={<Gauge size={22} />} label={t("Playback speed")} value={`${ctx.snap.rate}×`} expanded={open === "speed"} onClick={() => toggle("speed")}>
              <Choices
                options={SPEEDS.map((r) => ({ id: String(r), label: `${r}×` }))}
                current={String(ctx.snap.rate)}
                onPick={(id) => {
                  ctx.onRate(Number(id));
                  setOpen(null);
                }}
              />
            </Row>
          )}
          {sleep && !live && (
            <Row icon={<Moon size={22} />} label={t("Sleep timer")} value={sleepLabel} expanded={open === "sleep"} onClick={() => toggle("sleep")}>
              <Choices
                options={[{ id: "off", label: t("Off") }, ...SLEEP_PRESETS.map((p) => ({ id: p.id, label: t(p.label) }))]}
                current={sleep.mode.kind === "off" ? "off" : ""}
                onPick={(id) => {
                  if (id === "off") sleep.cancel();
                  else {
                    const preset = SLEEP_PRESETS.find((p) => p.id === id);
                    if (preset) sleep.set(preset.mode);
                  }
                  setOpen(null);
                }}
              />
            </Row>
          )}
          {ctx.onCropMode && (ctx.engine === "exo" || ctx.engine === "mpv") && (
            <Row
              icon={<Scan size={22} />}
              label={t("Picture")}
              value={t(PICTURE_MODES.find((m) => m.id === (ctx.cropMode ?? "fit"))?.label ?? "Fit")}
              expanded={open === "picture"}
              onClick={() => toggle("picture")}
            >
              <Choices
                options={PICTURE_MODES.map((m) => ({ id: m.id, label: t(m.label) }))}
                current={ctx.cropMode ?? "fit"}
                onPick={(id) => {
                  ctx.onCropMode?.(id);
                  setOpen(null);
                }}
              />
            </Row>
          )}
          {ctx.canPickAnother && (
            <Row icon={<Replace size={22} />} label={live ? t("TV Guide") : t("Switch stream")} onClick={act(ctx.onPickAnother)} />
          )}
          {ctx.showEpisodeNav && ctx.hasPrevEp && (
            <Row icon={<SkipBack size={22} />} label={t("Previous Episode")} onClick={act(ctx.onPrevEp)} />
          )}
          {download && !live && ctx.onDownloadStart && (
            <Row
              icon={<Download size={22} />}
              label={
                download.kind === "idle" || download.kind === "error"
                  ? t("Download")
                  : download.kind === "done"
                    ? t("Downloaded")
                    : download.kind === "paused"
                      ? t("Resume download")
                      : t("Downloading…")
              }
              value={"ratio" in download ? `${Math.round(download.ratio * 100)} %` : undefined}
              disabled={download.kind === "done" || download.kind === "preparing"}
              onClick={() => {
                if (download.kind === "idle") ctx.onDownloadStart?.();
                else if (download.kind === "error") ctx.onDownloadReset?.();
                else if (download.kind === "paused") ctx.onDownloadResume?.();
                else if (download.kind === "downloading" || download.kind === "queued") ctx.onDownloadPause?.();
              }}
            />
          )}
          {ctx.capabilities.pictureInPicture && (
            <Row icon={<PictureInPicture2 size={22} />} label={t("Picture in Picture")} onClick={act(ctx.onPiP)} />
          )}
          {ctx.onLuma && <Row icon={<ListVideo size={22} />} label={t("LUMA queue")} onClick={act(ctx.onLuma)} />}
        </div>
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  expanded,
  disabled = false,
  onClick,
  children,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={children ? expanded : undefined}
        className="flex h-14 w-full items-center gap-4 px-6 text-start active:bg-raised disabled:opacity-50"
      >
        <span className="text-ink-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate type-callout">{label}</span>
        {value && <span className="type-footnote text-ink-subtle">{value}</span>}
        {children && <ChevronDown size={18} className={`text-ink-subtle transition-transform ${expanded ? "rotate-180" : ""}`} />}
      </button>
      {children && expanded && <div className="px-6 pb-3 ps-[64px]">{children}</div>}
    </div>
  );
}

function Choices({ options, current, onPick }: { options: { id: string; label: string }[]; current: string; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o.id)}
          aria-pressed={o.id === current}
          className={`h-8 rounded-lg px-3 type-footnote font-medium transition-colors ${o.id === current ? "bg-ink text-canvas" : "bg-raised text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
