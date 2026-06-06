import { useState } from "react";
import { Info, Tv } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useFavorites } from "@/lib/iptv/favorites";
import type { IptvChannel } from "@/lib/iptv/types";
import { HoverTooltip } from "@/components/hover-tooltip";
import { FavoriteButton } from "../favorite-button";
import { CHANNEL_COL_PX, ROW_HEIGHT_PX } from "./guide-utils";

export function GuideChannelCell({
  channel,
  onPlay,
  onInfo,
  index,
  hydrated,
  width = CHANNEL_COL_PX,
}: {
  channel: IptvChannel;
  onPlay: (ch: IptvChannel) => void;
  onInfo?: (meta: Meta) => void;
  index: number;
  hydrated?: Meta | null;
  width?: number;
}) {
  const [errored, setErrored] = useState(false);
  const favorites = useFavorites();
  const isFav = favorites.has(channel.id);
  const posterUrl = hydrated?.poster && !errored ? hydrated.poster : null;
  const logoUrl = !posterUrl && channel.logo && !errored ? channel.logo : null;
  const displayName = hydrated?.name?.trim() || channel.name;
  return (
    <div
      className="sticky left-0 z-20 flex items-center gap-2.5 overflow-hidden border-b border-r border-edge-soft/55 bg-surface pr-2 pl-3"
      style={{ width, height: ROW_HEIGHT_PX, flex: `0 0 ${width}px` }}
    >
      <HoverTooltip
        label={displayName}
        sublabel={channel.group}
        className="flex min-w-0 flex-1"
      >
        <button
          onClick={() => onPlay(channel)}
          className="flex w-full min-w-0 items-center gap-2.5 py-2 text-left transition-opacity hover:opacity-85"
        >
          <span className="font-channel text-[11px] font-semibold tabular-nums tracking-[0.02em] text-ink-subtle">
            {String(index + 1).padStart(3, "0")}
          </span>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                draggable={false}
                loading="lazy"
                onError={() => setErrored(true)}
                className="h-full w-full object-cover"
              />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                draggable={false}
                loading="lazy"
                onError={() => setErrored(true)}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Tv size={18} strokeWidth={1.7} className="text-ink-subtle" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink">{displayName}</span>
            {channel.group && (
              <span className="truncate text-[11px] text-ink-subtle">{channel.group}</span>
            )}
          </div>
        </button>
      </HoverTooltip>
      <FavoriteButton
        active={isFav}
        onToggle={() => favorites.toggle(channel)}
        size={15}
        variant="inline"
      />
      {hydrated && onInfo && (
        <button
          onClick={() => onInfo(hydrated)}
          aria-label="Open details"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
        >
          <Info size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
