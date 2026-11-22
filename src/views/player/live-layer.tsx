import { Suspense, lazy } from "react";
import type { useLiveChannelOverlay } from "./hooks/use-live-channel-overlay";

const LiveChannelDvr = lazy(() => import("@/components/player/live-channel-dvr").then((m) => ({ default: m.LiveChannelDvr })));
const LiveChannelOverlay = lazy(() =>
  import("@/components/player/live-channel-overlay/overlay").then((m) => ({ default: m.LiveChannelOverlay })),
);

export function LiveLayer({
  liveOverlay,
  dvrOpen,
  onCloseDvr,
  srcUrl,
  channelName,
}: {
  liveOverlay: ReturnType<typeof useLiveChannelOverlay>;
  dvrOpen: boolean;
  onCloseDvr: () => void;
  srcUrl: string;
  channelName: string;
}) {
  return (
    <Suspense fallback={null}>
      {liveOverlay.open && liveOverlay.activeSource && (
        <LiveChannelOverlay
          source={liveOverlay.activeSource}
          sources={liveOverlay.availableSources}
          onSelectSource={liveOverlay.selectSource}
          currentChannelId={liveOverlay.currentChannelId}
          onSwitch={liveOverlay.switchChannel}
          onClose={() => liveOverlay.setOpen(false)}
          group={liveOverlay.group}
          setGroup={liveOverlay.setGroup}
          query={liveOverlay.query}
          setQuery={liveOverlay.setQuery}
        />
      )}
      {liveOverlay.isLive && liveOverlay.activeSource && liveOverlay.currentChannelId && dvrOpen && (
        <LiveChannelDvr
          open={dvrOpen}
          onClose={onCloseDvr}
          source={liveOverlay.activeSource}
          channelId={liveOverlay.currentChannelId}
          url={srcUrl}
          channelName={channelName}
        />
      )}
    </Suspense>
  );
}
