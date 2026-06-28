import type { RefObject } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlayerShell, type PlayerShellProps } from "@/lib/player-shells/registry";
import { writePlayerPrefs } from "@/lib/player-prefs";
import { writePlayerVolume } from "@/lib/player-volume";
import { useSettings } from "@/lib/settings";
import { LANGUAGES } from "@/lib/i18n";
import { translateCues, type TranslateProvider } from "@/lib/subtitles/translate";
import type { SubCue } from "@/lib/subtitles/parser";
import type { useVideoDownload } from "./hooks/use-video-download";

export function ShellLayer({
  shellId,
  shellSnap,
  snapRef,
  bridgeRef,
  engine,
  visible,
  fullscreen,
  drawMode,
  hideOthersDrawings,
  pipMode,
  showDraw,
  metaId,
  onMenuOpenChange,
  onBack,
  onPlayPause,
  onSeek,
  onSeekStep,
  rememberSubChoice,
  onEnterSync,
  cropMode,
  onCropMode,
  anime4kMode,
  onAnime4kMode,
  anime4kAvailable,
  onPiP,
  onFullscreen,
  openCastMenu,
  onToggleDraw,
  onToggleHideOthers,
  onScreenshot,
  onPickAnother,
  canPickAnother,
  title,
  subtitle,
  resolution,
  quality,
  hoverTitle,
  hoverSub,
  hasPrevEp,
  hasNextEp,
  onPrevEp,
  onNextEp,
  metaImdbId,
  metaTitle,
  metaReleaseDate,
  meta,
  tmdbKey,
  season,
  episode,
  download,
  onOpenDvr,
  sleep,
}: {
  shellId: string;
  shellSnap: PlayerSnapshot;
  snapRef: RefObject<PlayerSnapshot>;
  bridgeRef: RefObject<PlayerBridge | null>;
  engine: "html5" | "mpv";
  visible: boolean;
  fullscreen: boolean;
  drawMode: boolean;
  hideOthersDrawings: boolean;
  pipMode: boolean;
  showDraw: boolean;
  metaId: string;
  onMenuOpenChange: (open: boolean) => void;
  onBack: () => void;
  onPlayPause: () => void;
  onSeek: (sec: number) => void;
  onSeekStep: (delta: number) => void;
  rememberSubChoice: (t: { lang?: string } | null | undefined) => void;
  onEnterSync?: () => void;
  cropMode?: string;
  onCropMode?: (id: string) => void;
  anime4kMode?: string;
  onAnime4kMode?: (id: string) => void;
  anime4kAvailable?: boolean;
  onPiP: () => void;
  onFullscreen: () => void;
  openCastMenu: (anchor: { right: number; bottom: number } | null) => void;
  onToggleDraw: () => void;
  onToggleHideOthers: () => void;
  onScreenshot: () => void;
  onPickAnother: () => void;
  canPickAnother: boolean;
  title: string;
  subtitle?: string;
  resolution?: string | null;
  quality?: string | null;
  hoverTitle?: string;
  hoverSub?: string;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  onPrevEp: () => void;
  onNextEp: () => void;
  metaImdbId: string | null;
  metaTitle: string | null;
  metaReleaseDate: string | null;
  meta: Meta;
  tmdbKey: string | null;
  season: number | null;
  episode: number | null;
  download: ReturnType<typeof useVideoDownload>;
  onOpenDvr?: () => void;
  sleep: PlayerShellProps["sleep"];
}) {
  const ActiveShell = getPlayerShell(shellId).Component;
  const { settings } = useSettings();
  return (
    <ActiveShell
      snap={shellSnap}
      engine={engine}
      useOverlayPopups={false}
      onMenuOpenChange={onMenuOpenChange}
      capabilities={bridgeRef.current?.capabilities() ?? { engine: "html5", pictureInPicture: false, airplay: false, chromecast: false, hdrPassthrough: false, hardwareDecode: true }}
      visible={visible}
      fullscreen={fullscreen}
      drawMode={drawMode}
      hideOthersDrawings={hideOthersDrawings}
      pipMode={pipMode}
      showDraw={showDraw}
      onBack={onBack}
      onPlayPause={onPlayPause}
      onSeek={onSeek}
      onSeekStep={onSeekStep}
      onMute={() => {
        const next = !snapRef.current.muted;
        bridgeRef.current?.setMuted(next);
        writePlayerVolume({ muted: next });
      }}
      onVolume={(v) => {
        bridgeRef.current?.setVolume(v);
        writePlayerVolume({ volume: v });
      }}
      onAudio={(id) => {
        bridgeRef.current?.setAudioTrack(id);
        const t = snapRef.current.audioTracks.find((x) => x.id === id);
        if (t?.lang) writePlayerPrefs(metaId, { audioLang: t.lang });
      }}
      onSubtitle={(id) => {
        bridgeRef.current?.setSubtitleTrack(id);
        rememberSubChoice(snapRef.current.subtitleTracks.find((x) => x.id === id));
      }}
      onSubDelay={(s) => {
        bridgeRef.current?.setSubDelay(s);
        writePlayerPrefs(metaId, { subDelaySec: s });
      }}
      onEnterSync={onEnterSync}
      onTranslate={async (code) => {
        const b = bridgeRef.current;
        if (!b) return { ok: false, error: "no player" };
        const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

        // 1. Source cues. mpv always returns null here, so fall back to fetching and
        //    parsing the selected track URL — same approach as use-text-sync.
        let cues = b.getSelectedTrackCues();
        if (!cues || cues.length === 0) {
          const url = b.getSelectedTrackUrl();
          let readable: string | null = null;
          if (url) {
            if (/^(https?|blob|data|tauri|asset):/i.test(url)) readable = url;
            else if (isTauri) readable = (await import("@tauri-apps/api/core")).convertFileSrc(url);
          }
          if (readable) {
            try {
              cues = await (await import("@/lib/subtitles/parser")).fetchAndParse(readable);
            } catch {
              /* leave cues null — reported via the empty check below */
            }
          }
        }
        if (!cues || cues.length === 0) {
          return { ok: false, error: "No subtitle cues to translate" };
        }

        // 2. Provider from settings.
        const provider: TranslateProvider =
          settings.subTranslateProvider === "ollama"
            ? { kind: "ollama", baseUrl: settings.ollamaUrl, model: settings.ollamaModel }
            : { kind: "openrouter", apiKey: settings.aiSearchKey, model: settings.aiSearchModel };
        if (provider.kind === "openrouter" && !provider.apiKey.trim()) {
          return { ok: false, error: "Add an OpenRouter API key in Settings" };
        }
        const targetName = LANGUAGES.find((l) => l.code === code)?.label ?? "English";

        // 3. Translate (timing preserved inside translateCues).
        let translated: SubCue[];
        try {
          translated = await translateCues(cues, targetName, provider, { batchSize: 40 });
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }

        // 4. Apply as a new track — same pattern as use-text-sync save().
        const { toSrt } = await import("@/lib/subtitles/serialize");
        const text = toSrt(translated);
        const label = `${targetName} (AI)`;
        if (isTauri) {
          try {
            const p = await import("@tauri-apps/api/path");
            const dir = await p.join(await p.tempDir(), "harbor-subs");
            const fp = await p.join(dir, `translated-${Date.now()}.srt`);
            await (await import("@tauri-apps/api/core")).invoke("save_text_file", {
              path: fp,
              contents: text,
            });
            const ok = await b.addSubtitle(fp, code, label, true);
            if (ok) {
              rememberSubChoice({ lang: code });
              return { ok: true };
            }
          } catch (e) {
            console.warn("[subtitles] native translate apply failed, falling back", e);
          }
        }
        const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
        const ok = await b.addSubtitle(dataUrl, code, label, true);
        if (ok) rememberSubChoice({ lang: code });
        return ok ? { ok: true } : { ok: false, error: "Could not apply translated track" };
      }}
      onAudioDelay={(s) => bridgeRef.current?.setAudioDelay(s)}
      onAddSubtitle={(url, lang, title2) => {
        const p = bridgeRef.current?.addSubtitle(url, lang, title2) ?? Promise.resolve(false);
        void p.then((ok) => {
          if (ok) rememberSubChoice({ lang });
        });
        return p;
      }}
      onRate={(r) => {
        bridgeRef.current?.setRate(r);
        writePlayerPrefs(metaId, { rate: r });
      }}
      cropMode={cropMode}
      onCropMode={onCropMode}
      anime4kMode={anime4kMode}
      onAnime4kMode={onAnime4kMode}
      anime4kAvailable={anime4kAvailable}
      onPiP={onPiP}
      onFullscreen={onFullscreen}
      onCast={() => {
        const btn = (document.querySelector(
          '[aria-label="Cast"]',
        ) as HTMLElement | null);
        if (btn) {
          const r = btn.getBoundingClientRect();
          openCastMenu({ right: r.right, bottom: r.top });
        } else {
          openCastMenu(null);
        }
      }}
      onToggleDraw={onToggleDraw}
      onToggleHideOthers={onToggleHideOthers}
      onScreenshot={onScreenshot}
      onPickAnother={onPickAnother}
      canPickAnother={canPickAnother}
      title={title}
      subtitle={subtitle}
      resolution={resolution}
      quality={quality}
      hoverTitle={hoverTitle}
      hoverSub={hoverSub}
      hasPrevEp={hasPrevEp}
      hasNextEp={hasNextEp}
      onPrevEp={onPrevEp}
      onNextEp={onNextEp}
      metaImdbId={metaImdbId}
      metaTitle={metaTitle}
      metaReleaseDate={metaReleaseDate}
      meta={meta}
      tmdbKey={tmdbKey}
      season={season}
      episode={episode}
      download={download.status}
      onDownloadStart={download.start}
      onDownloadCancel={download.cancel}
      onDownloadReveal={download.reveal}
      onDownloadReset={download.reset}
      onOpenDvr={onOpenDvr}
      sleep={sleep}
    />
  );
}
