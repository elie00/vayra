import { useCallback } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { buildCatchupUrl } from "@/lib/iptv/catchup";
import { headersFromChannel } from "@/lib/iptv/channel-headers";
import { recordChannelPlay } from "@/lib/iptv/channel-stats";
import { buildM3u, suggestExportFilename } from "@/lib/iptv/export";
import { findCurrent } from "@/lib/iptv/xmltv";
import type { EpgIndex, EpgProgram, IptvChannel, IptvPlaylist } from "@/lib/iptv/types";
import type { Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { emitAppFeedback } from "@/lib/app-feedback";
import { useT } from "@/lib/i18n";
import { fetchAddonJson, isAddonChannel, resolveAddonChannelStream } from "@/lib/iptv/addon-guide";

export function synthChannelMeta(ch: IptvChannel): Meta {
  return {
    id: `iptv:${ch.id}`,
    type: "tv",
    name: ch.name,
    poster: ch.logo ?? undefined,
    logo: ch.logo ?? undefined,
    background: ch.logo ?? undefined,
    description: ch.group ? `Live channel: ${ch.group}` : "Live channel",
    releaseInfo: "Live",
  };
}

export function useLiveActions(params: {
  epg: EpgIndex | null;
  activeId: string | null;
  playlist: IptvPlaylist | null;
}) {
  const { epg, activeId, playlist } = params;
  const { openPlayer } = useView();
  const { settings } = useSettings();
  const t = useT();

  const handlePlay = useCallback(
    (ch: IptvChannel) => {
      recordChannelPlay(ch);
      const programs = ch.tvgId ? epg?.byChannel.get(ch.tvgId) : undefined;
      const liveProgram = findCurrent(programs, Date.now()).current?.title ?? undefined;
      const open = (url: string, headers: Record<string, string> | undefined) =>
        openPlayer({
          meta: synthChannelMeta(ch),
          url,
          title: ch.name,
          subtitle: ch.group ?? "Live",
          notWebReady: true,
          isLive: true,
          headers,
          liveProgram,
        });
      if (!isAddonChannel(ch)) {
        open(ch.url, headersFromChannel(ch));
        return;
      }
      // An addon channel has no fixed URL: its addon resolves the stream by channel id.
      void resolveAddonChannelStream(fetchAddonJson, ch).then((stream) => {
        if (stream) open(stream.url, stream.headers);
        else emitAppFeedback({ kind: "error", text: t("{name} has no stream right now.", { name: ch.name }) });
      });
    },
    [openPlayer, epg, t],
  );

  const handlePlayCatchup = useCallback(
    (ch: IptvChannel, program: EpgProgram) => {
      const url = buildCatchupUrl(ch, program.startMs, program.endMs);
      if (!url) {
        handlePlay(ch);
        return;
      }
      openPlayer({
        meta: synthChannelMeta(ch),
        url,
        title: program.title || ch.name,
        subtitle: `${ch.name} · catch up`,
        notWebReady: true,
        isLive: true,
        headers: headersFromChannel(ch),
        liveProgram: program.title || undefined,
      });
    },
    [openPlayer, handlePlay],
  );

  const exportPlaylist = useCallback(
    async (id: string) => {
      if (id !== activeId || !playlist) return;
      const source = settings.iptvPlaylists.find((s) => s.id === id);
      const filename = suggestExportFilename(source?.name ?? "playlist");
      try {
        const target = await saveDialog({
          defaultPath: filename,
          filters: [{ name: "M3U Playlist", extensions: ["m3u", "m3u8"] }],
        });
        if (!target) return;
        await invoke("vayra_write_text_file", {
          path: target,
          contents: buildM3u(playlist.channels, playlist.epgUrl),
        });
      } catch (e) {
        console.warn("[live] export playlist failed", e);
      }
    },
    [activeId, playlist, settings.iptvPlaylists],
  );

  return { handlePlay, handlePlayCatchup, exportPlaylist };
}
