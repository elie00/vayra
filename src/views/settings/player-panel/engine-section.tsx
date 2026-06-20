import { isWindowsDesktop } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { ToggleRow } from "../shared";
import { Anime4kShaderList } from "./anime4k-shader-list";
import { BandwidthInput } from "./bandwidth-section";
import { DesktopOnlyBlock, isTauri } from "./internals";

export function PlayerEnginePanel() {
  const { settings, update } = useSettings();
  const t = useT();
  const strictRemote = !!settings.remoteStreamServerUrl && settings.remoteStreamServerStrict;

  const choices: Array<{
    id: "auto" | "html5" | "mpv";
    label: string;
    sub: string;
    recommended?: boolean;
  }> = [
    {
      id: "auto",
      label: t("Auto"),
      sub: t("mpv on the desktop app, HTML5 in the browser. The right engine without thinking about it."),
      recommended: true,
    },
    {
      id: "html5",
      label: "HTML5",
      sub: t("Native webview playback. Smooth and integrated, but limited codec coverage."),
    },
    {
      id: "mpv",
      label: "mpv",
      sub: t("Bundled with Harbor. Plays anything you throw at it."),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DesktopOnlyBlock>
        <div className="flex flex-col gap-2.5">
            {choices.map((c) => {
              const selected = settings.playerEngine === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ playerEngine: c.id })}
                  className={`flex items-start gap-3.5 rounded-2xl border px-5 py-4 text-start transition-colors ${
                    selected
                      ? "border-ink bg-elevated"
                      : "border-edge-soft bg-canvas/40 hover:border-edge hover:bg-canvas/60"
                  }`}
                >
                  <span
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? "border-ink" : "border-edge"
                    }`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{c.label}</span>
                      {c.recommended && (
                        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
                          {t("Recommended")}
                        </span>
                      )}
                    </div>
                    <span className="text-[12.5px] leading-snug text-ink-muted">{c.sub}</span>
                  </div>
                </button>
              );
            })}
          </div>
      </DesktopOnlyBlock>

      <DesktopOnlyBlock>
        <div className="flex flex-col gap-2">
          <ToggleRow
            label={t("Embed mpv inside Harbor window")}
            sub={t("Renders mpv inline so playback lives in Harbor itself. Disable to open it in a separate window instead.")}
            value={settings.playerMpvEmbed}
            onChange={(v) => update({ playerMpvEmbed: v })}
          />
          <ToggleRow
            label={t("HDR-to-SDR tonemapping")}
            sub={t("Maps HDR sources to SDR using bt.2446a. Recommended on SDR displays.")}
            value={settings.playerHdrToSdr}
            onChange={(v) => update({ playerHdrToSdr: v })}
          />
          {isWindowsDesktop() && (
            <ToggleRow
              label={t("HDR in a separate window")}
              sub={t("Plays HDR content in its own window so Windows treats it as true HDR (the SDR brightness slider stops dimming it). Turn off HDR-to-SDR tonemapping above to use this on an HDR display.")}
              value={settings.playerHdrOpaqueWindow}
              onChange={(v) => update({ playerHdrOpaqueWindow: v })}
            />
          )}
          {isWindowsDesktop() && (
            <div className="flex flex-col gap-1.5 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4">
              <span className="text-[15px] font-semibold text-ink">{t("HDR display mode")}</span>
              <span className="text-[12.5px] leading-snug text-ink-muted">
                {t("Keeps Harbor embedded but lifts the HDR video onto its own opaque plane with the controls floating above, so Windows shows true HDR without the brightness slider dimming it. Needs HDR-to-SDR tonemapping off.")}
              </span>
              <div className="mt-1 flex gap-1.5">
                {(
                  [
                    { id: "auto", label: t("Auto") },
                    { id: "off", label: t("Off") },
                    { id: "always", label: t("Always") },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => update({ playerHdrStage: o.id })}
                    className={`rounded-xl border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      settings.playerHdrStage === o.id
                        ? "border-ink bg-elevated text-ink"
                        : "border-edge-soft bg-canvas/40 text-ink-muted hover:border-edge"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isWindowsDesktop() && (
            <ToggleRow
              label={t("Line-free video mode")}
              sub={t("Forces a compatibility present mode that removes a thin bright line some monitors show at the screen edge. Side effects: 4K playback can drop to a slideshow and HDR content looks dimmer (this mode bypasses the HDR display path). Leave OFF unless you see that line. Restart playback to apply.")}
              value={settings.playerD3d11Flip}
              onChange={(v) => update({ playerD3d11Flip: v })}
            />
          )}
          <ToggleRow
            label={t("Motion smoothing")}
            sub={t("Interpolates frames for smoother panning, best on anime. Needs a display refresh rate above the video's frame rate, and can stutter on weak GPUs. mpv only.")}
            value={settings.playerMotionInterp}
            onChange={(v) => update({ playerMotionInterp: v })}
          />
          <ToggleRow
            label={t("Direct torrent streaming")}
            sub={t("When you have no debrid set up, or a torrent isn't cached, stream it straight from the bundled engine on localhost:11470. This connects to peers over your own connection, the same way Stremio's built-in streaming does.")}
            value={settings.directTorrentStream}
            onChange={(v) => update({ directTorrentStream: v })}
            lockReason={strictRemote ? t("Disabled while strict remote streaming is on") : undefined}
          />
          <ToggleRow
            label={t("Use Harbor's built-in engine (beta)")}
            sub={t("Stream torrents through Harbor's own Rust peer-to-peer engine instead of the bundled Stremio Server. Falls back automatically if it can't connect. Status and a self-test live in the Local engine card below.")}
            value={settings.localEngine}
            onChange={(v) => update({ localEngine: v })}
            lockReason={strictRemote ? t("Disabled while strict remote streaming is on") : undefined}
          />
          <ToggleRow
            label={t("Always re-encode when casting (recommended)")}
            sub={t("On by default. Pipes every cast through ffmpeg as H.264 + AAC + MPEG-TS so Samsung, LG, Sony, and other DLNA TVs accept the stream regardless of source codec. Turn off only if you have a beefy receiver that handles raw HEVC/DTS and want max quality. Requires ffmpeg in PATH.")}
            value={settings.castAlwaysTranscode}
            onChange={(v) => update({ castAlwaysTranscode: v })}
          />
          <ToggleRow
            label={t("Anime4K upscaling")}
            sub={t("Sharper lines and cleaner gradients on anime, in real time. One-tap setup below.")}
            value={settings.playerAnime4k}
            onChange={(v) => update({ playerAnime4k: v })}
          />
          {settings.playerAnime4k && (
            <ToggleRow
              label={t("Show Anime4K indicator")}
              sub={t("A small badge over the video (with live FPS) that only appears when Anime4K is actually running. Follows your anime-only setting.")}
              value={settings.playerAnime4kIndicator}
              onChange={(v) => update({ playerAnime4kIndicator: v })}
            />
          )}
        </div>
      </DesktopOnlyBlock>

      {settings.playerAnime4k && isTauri && <Anime4kShaderList />}

      <DesktopOnlyBlock>
        <BandwidthInput />
      </DesktopOnlyBlock>
    </div>
  );
}
