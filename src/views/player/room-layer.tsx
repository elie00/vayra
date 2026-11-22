import { Suspense, lazy, useMemo } from "react";
import type { PanelCorner } from "@/lib/player-chrome";
import type { RoomSnapshot } from "@/lib/together/client";
import type { ChatMessage } from "@/lib/together/provider";
import type { ParticipantLocation, SourceDescriptor, SyncState } from "@/lib/together/protocol";

const AvatarDock = lazy(() => import("@/components/player/avatar-dock").then((m) => ({ default: m.AvatarDock })));
const ChatOverlay = lazy(() => import("@/components/player/chat-overlay").then((m) => ({ default: m.ChatOverlay })));
const DurationMismatchChip = lazy(() =>
  import("./duration-mismatch-chip").then((m) => ({ default: m.DurationMismatchChip })),
);
const ForeignNoticeBox = lazy(() => import("./foreign-notice-box").then((m) => ({ default: m.ForeignNoticeBox })));
const WaitingForRoom = lazy(() => import("./waiting-for-room").then((m) => ({ default: m.WaitingForRoom })));

export function RoomLayer({
  inRoom,
  pipMode,
  drawMode,
  participants,
  clientId,
  hostClientId,
  syncState,
  avatarsVisible,
  presenceMap,
  participantLocations,
  now,
  avatarsCorner,
  avatarsHidden,
  chat,
  sendChat,
  chromeVisible,
  chatCorner,
  chatHidden,
  showWaiting,
  isHost,
  staleIds,
  guestEscapeReady,
  onStart,
  onPlayWithoutSync,
  onLeave,
  guestHostSource,
  guestDurationSec,
  casting,
  currentUrl,
  switcherOpen,
  onFindCloser,
  foreignNotice,
  onDismissForeign,
}: {
  inRoom: boolean;
  pipMode: boolean;
  drawMode: boolean;
  participants: RoomSnapshot["participants"];
  clientId: string;
  hostClientId: string | null;
  syncState: SyncState | null;
  avatarsVisible: boolean;
  presenceMap: Map<string, number>;
  participantLocations: Map<string, ParticipantLocation>;
  now: number;
  avatarsCorner: PanelCorner;
  avatarsHidden: boolean;
  chat: ChatMessage[];
  sendChat: (text: string) => void;
  chromeVisible: boolean;
  chatCorner: PanelCorner;
  chatHidden: boolean;
  showWaiting: boolean;
  isHost: boolean;
  staleIds: Set<string>;
  guestEscapeReady: boolean;
  onStart: () => void;
  onPlayWithoutSync: () => void;
  onLeave: () => void;
  guestHostSource: SourceDescriptor | null;
  guestDurationSec: number;
  casting: boolean;
  currentUrl: string;
  switcherOpen: boolean;
  onFindCloser: () => void;
  foreignNotice: { title: string | null; from: string } | null;
  onDismissForeign: () => void;
}) {
  const everyoneReady = useMemo(
    () => participants.length > 0 && participants.every((p) => p.ready),
    [participants],
  );
  const notReady = useMemo(() => participants.filter((p) => !p.ready), [participants]);
  return (
    <Suspense fallback={null}>
      {inRoom && !pipMode && (
        <AvatarDock
          participants={participants}
          selfId={clientId}
          hostId={hostClientId}
          syncState={syncState}
          visible={avatarsVisible}
          presenceMap={presenceMap}
          participantLocations={participantLocations}
          now={now}
          corner={avatarsCorner}
          hidden={avatarsHidden}
        />
      )}

      {inRoom && !pipMode && (
        <ChatOverlay
          messages={chat}
          onSend={sendChat}
          selfId={clientId}
          participants={participants}
          forceVisible={chromeVisible}
          corner={chatCorner}
          hidden={chatHidden}
        />
      )}

      {showWaiting && (
        <WaitingForRoom
          isHost={isHost}
          notReady={notReady}
          participants={participants}
          clientId={clientId}
          everyoneReady={everyoneReady}
          staleIds={staleIds}
          guestEscapeReady={guestEscapeReady}
          onStart={onStart}
          onPlayWithoutSync={onPlayWithoutSync}
          onLeave={onLeave}
        />
      )}

      {!pipMode && !drawMode && guestHostSource && (
        <DurationMismatchChip
          hostSource={guestHostSource}
          guestDurationSec={guestDurationSec}
          casting={casting}
          currentUrl={currentUrl}
          switcherOpen={switcherOpen}
          onFindCloser={onFindCloser}
        />
      )}

      {foreignNotice && (
        <ForeignNoticeBox title={foreignNotice.title} onDismiss={onDismissForeign} />
      )}
    </Suspense>
  );
}
