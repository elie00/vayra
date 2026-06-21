import { FormatBadge, type BadgeKind } from "@/components/format-badge";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { Section, Segmented, ToggleRow } from "../shared";

export function DisplaySection() {
  const t = useT();
  const { settings, update } = useSettings();
  return (
    <>
      <Section
        title={t("Poster size")}
        subtitle={t("Scale every poster and card across Home, Discover, and your library. Bump it up on a 4K or large display where the defaults feel small, or shrink it for a denser grid.")}
      >
        <Segmented
          value={posterSizeKey(settings.posterScale)}
          options={POSTER_SIZES.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) =>
            update({ posterScale: POSTER_SIZES.find((p) => p.value === v)?.scale ?? 1 })
          }
        />
      </Section>

      <Section
        title={t("Title text")}
        subtitle={t("Resize the row titles on Home and the title shown in the player, without scaling the rest of the interface. You can also lead the player title with the series name instead of the episode.")}
      >
        <SizeSlider
          label={t("Row titles")}
          value={settings.rowTitleScale}
          onChange={(v) => update({ rowTitleScale: v })}
        />
        <SizeSlider
          label={t("Player title")}
          value={settings.playerTitleScale}
          onChange={(v) => update({ playerTitleScale: v })}
        />
        <ToggleRow
          label={t("Show series name first in the player")}
          sub={t("Lead with the show name instead of the episode title at the top of the player.")}
          value={settings.playerTitleSeriesFirst}
          onChange={(v) => update({ playerTitleSeriesFirst: v })}
        />
      </Section>

      <Section
        title={t("Accessibility")}
        subtitle={t("Make everything bigger and easier to read: sidebar, menus, popups, every page. The whole interface scales live as you drag, so you can see the change right here. Great on 4K and ultrawide monitors, or whenever the text feels small.")}
      >
        <div className="flex items-center gap-4 px-1 py-1.5">
          <span className="w-32 shrink-0 text-[13.5px] font-medium text-ink">{t("Interface scale")}</span>
          <input
            type="range"
            min={0.8}
            max={1.6}
            step={0.05}
            value={settings.uiScale}
            onChange={(e) => update({ uiScale: parseFloat(e.target.value) })}
            className="h-1 flex-1 appearance-none rounded-full bg-edge-soft accent-ink"
          />
          <span className="w-14 shrink-0 text-end text-[13px] tabular-nums text-ink-muted">
            {Math.round(settings.uiScale * 100)}%
          </span>
          {settings.uiScale !== 1 && (
            <button
              onClick={() => update({ uiScale: 1 })}
              className="shrink-0 text-[12.5px] font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              {t("Reset")}
            </button>
          )}
        </div>
      </Section>

      <Section
        title={t("Stream format chips")}
        subtitle={t("The little 4K · HDR · codec · audio chips that ride along each stream in the play picker.")}
      >
        <ToggleRow
          label={t("Show format chips on stream rows")}
          sub={t("The picker tags each stream with resolution, HDR flavor, codec, and audio format. Off hides them all.")}
          value={settings.showQualityBadge}
          onChange={(v) => update({ showQualityBadge: v })}
        />
        <QualityPreview />
      </Section>

      <Section
        title={t("Home hero shadow")}
        subtitle={t("How dark the gradient behind the featured title on Home is. 100% is the classic look; lower it to let more of the artwork show through.")}
      >
        <div className="flex items-center gap-4 px-1 py-1.5">
          <span className="w-32 shrink-0 text-[13.5px] font-medium text-ink">{t("Shadow")}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.heroShadow}
            onChange={(e) => update({ heroShadow: parseInt(e.target.value, 10) })}
            className="h-1 flex-1 appearance-none rounded-full bg-edge-soft accent-ink"
          />
          <span className="w-14 shrink-0 text-end text-[13px] tabular-nums text-ink-muted">
            {settings.heroShadow}%
          </span>
          {settings.heroShadow !== 100 && (
            <button
              onClick={() => update({ heroShadow: 100 })}
              className="shrink-0 text-[12.5px] font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              {t("Reset")}
            </button>
          )}
        </div>
      </Section>

      <Section
        title={t("Trailer quality")}
        subtitle={t("How sharp the trailer is when you hit the preview button. Auto picks from your connection speed. 1080p and Best merge separate video and audio with the bundled ffmpeg, so they take a beat longer to start.")}
      >
        <Segmented
          value={settings.trailerQuality}
          options={[
            { value: "auto", label: "Auto" },
            { value: "360p", label: "360p" },
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
            { value: "best", label: "Best" },
          ]}
          onChange={(v) => update({ trailerQuality: v })}
        />
        <ToggleRow
          label={t("Autoplay trailer on detail pages")}
          sub={t("Plays a muted trailer in the backdrop when you open a title. Click the speaker to unmute. Falls back to the image when no trailer is available.")}
          value={settings.detailTrailerAutoplay}
          onChange={(v) => update({ detailTrailerAutoplay: v })}
        />
      </Section>
    </>
  );
}

function SizeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-4 px-1 py-1.5">
      <span className="w-32 shrink-0 text-[13.5px] font-medium text-ink">{label}</span>
      <input
        type="range"
        min={0.8}
        max={1.6}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 appearance-none rounded-full bg-edge-soft accent-ink"
      />
      <span className="w-14 shrink-0 text-end text-[13px] tabular-nums text-ink-muted">
        {Math.round(value * 100)}%
      </span>
      {value !== 1 && (
        <button
          onClick={() => onChange(1)}
          className="shrink-0 text-[12.5px] font-medium text-ink-subtle transition-colors hover:text-ink"
        >
          {t("Reset")}
        </button>
      )}
    </div>
  );
}

const POSTER_SIZES = [
  { value: "compact", label: "Compact", scale: 0.85 },
  { value: "default", label: "Default", scale: 1 },
  { value: "large", label: "Large", scale: 1.25 },
  { value: "huge", label: "Huge", scale: 1.55 },
] as const;

function posterSizeKey(scale: number): string {
  let best: (typeof POSTER_SIZES)[number] = POSTER_SIZES[0];
  for (const p of POSTER_SIZES) {
    if (Math.abs(p.scale - scale) < Math.abs(best.scale - scale)) best = p;
  }
  return best.value;
}

function QualityPreview() {
  const samples: BadgeKind[] = [
    "8k",
    "4k-uhd",
    "uhd",
    "2k-qhd",
    "1080p",
    "1080i",
    "720p",
    "576p",
    "480p",
    "360p",
    "hd",
    "sd",
    "dvd",
    "imax",
    "3d",
    "bluray",
    "remux",
    "webdl",
    "webrip",
    "hdtv",
    "dvb",
    "cam",
    "hdcam",
    "telesync",
    "hdts",
    "telecine",
    "scr",
    "wp",
    "hevc",
    "av1",
    "dv",
    "hdr10-plus",
    "hdr10",
    "hdr",
    "hlg",
    "sdr",
    "atmos",
    "atmos-912",
    "truehd",
    "dts-hd-ma",
    "dts-hd",
    "dts-x",
    "dts",
    "ddp",
    "dd",
    "eac3",
    "ac3",
    "aac",
    "flac",
    "mp3",
    "opus",
    "lpcm",
    "pcm",
    "7.1",
    "5.1",
    "stereo",
    "mono",
    "extended",
    "remastered",
    "repack",
  ];
  return (
    <div className="flex flex-wrap items-center gap-0 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3.5">
      {samples.map((k) => (
        <FormatBadge key={k} kind={k} />
      ))}
    </div>
  );
}
