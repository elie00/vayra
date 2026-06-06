import { isLinuxDesktop } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { ToggleRow } from "../shared";
import { Anime4kShaderList } from "./anime4k-shader-list";
import { BandwidthInput } from "./bandwidth-section";
import { DesktopOnlyBlock, isTauri } from "./internals";

export function PlayerEnginePanel() {
  const { settings, update } = useSettings();
  const linux = isLinuxDesktop();

  const choices: Array<{
    id: "auto" | "html5" | "mpv";
    label: string;
    sub: string;
    recommended?: boolean;
  }> = [
    {
      id: "auto",
      label: "Auto",
      sub: "mpv on the desktop app, HTML5 in the browser. The right engine without thinking about it.",
      recommended: true,
    },
    {
      id: "html5",
      label: "HTML5",
      sub: "Native webview playback. Smooth and integrated, but limited codec coverage.",
    },
    {
      id: "mpv",
      label: "mpv",
      sub: "Bundled with Harbor. Plays anything you throw at it.",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DesktopOnlyBlock>
        {linux && <LinuxEngineNote />}
        <div className="flex flex-col gap-2.5">
            {choices.map((c) => {
              const selected = settings.playerEngine === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ playerEngine: c.id })}
                  className={`flex items-start gap-3.5 rounded-2xl border px-5 py-4 text-left transition-colors ${
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
                          Recommended
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
          {!linux && (
            <>
              <ToggleRow
                label="Embed mpv inside Harbor window"
                sub="Renders mpv inline so playback lives in Harbor itself. Disable to open it in a separate window instead."
                value={settings.playerMpvEmbed}
                onChange={(v) => update({ playerMpvEmbed: v })}
              />
              <ToggleRow
                label="HDR-to-SDR tonemapping"
                sub="Maps HDR sources to SDR using bt.2446a. Recommended on SDR displays."
                value={settings.playerHdrToSdr}
                onChange={(v) => update({ playerHdrToSdr: v })}
              />
            </>
          )}
          <ToggleRow
            label="Fallback to Stremio Server transcoding"
            sub="When a stream fails to decode, retry through Stremio Server's HLS transcoder running on localhost:11470. Requires Stremio Server to be running."
            value={settings.stremioServerTranscode}
            onChange={(v) => update({ stremioServerTranscode: v })}
          />
          <ToggleRow
            label="Direct torrent streaming"
            sub="When you have no debrid set up, or a torrent isn't cached, stream it straight from the bundled engine on localhost:11470. This connects to peers over your own connection, the same way Stremio's built-in streaming does."
            value={settings.directTorrentStream}
            onChange={(v) => update({ directTorrentStream: v })}
          />
          <ToggleRow
            label="Always re-encode when casting (recommended)"
            sub="On by default. Pipes every cast through ffmpeg as H.264 + AAC + MPEG-TS so Samsung, LG, Sony, and other DLNA TVs accept the stream regardless of source codec. Turn off only if you have a beefy receiver that handles raw HEVC/DTS and want max quality. Requires ffmpeg in PATH."
            value={settings.castAlwaysTranscode}
            onChange={(v) => update({ castAlwaysTranscode: v })}
          />
          {!linux && (
            <ToggleRow
              label="Anime4K upscaling"
              sub="Sharper lines and cleaner gradients on anime, in real time. One-tap setup below."
              value={settings.playerAnime4k}
              onChange={(v) => update({ playerAnime4k: v })}
            />
          )}
        </div>
      </DesktopOnlyBlock>

      {!linux && settings.playerAnime4k && isTauri && <Anime4kShaderList />}

      <DesktopOnlyBlock>
        <BandwidthInput />
      </DesktopOnlyBlock>
    </div>
  );
}

function LinuxEngineNote() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold text-ink">Playback on Linux</span>
        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
          Linux
        </span>
      </div>
      <p className="text-[12.5px] leading-snug text-ink-muted">
        mpv now plays your streams on Linux with full codec coverage (HEVC, AC3, MKV, and more). For
        now it opens in its own window with built-in controls; in-window playback matching Windows
        and macOS is on the way. HTML5 stays available as a fallback if you prefer the webview
        player.
      </p>
    </div>
  );
}
