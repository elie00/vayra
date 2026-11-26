import { Check, Crown, Link2, LogOut, RefreshCw, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { VaraRemoteRoom } from "@/lib/vara/types";

export function SyncDrawer(props: {
  room: VaraRemoteRoom;
  currentUserId: string | null;
  syncActive: boolean;
  onClose: () => void;
  onCopyInviteLink: () => Promise<boolean>;
  onClaimHost: () => Promise<void>;
  onTransferHost: (userId: string) => Promise<void>;
  onForceResync: () => void;
  onLeaveRoom: () => void;
}) {
  const t = useT();
  const {
    room,
    currentUserId,
    syncActive,
    onClose,
    onCopyInviteLink,
    onClaimHost,
    onTransferHost,
    onForceResync,
    onLeaveRoom,
  } = props;

  const isHost = currentUserId != null && room.hostId === currentUserId;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [resynced, setResynced] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const handleCopy = async () => {
    if (busyAction) return;
    setBusyAction("copy");
    setCopyFailed(false);
    try {
      const ok = await onCopyInviteLink();
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } else {
        setCopyFailed(true);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleClaim = async () => {
    if (busyAction) return;
    setBusyAction("claim");
    try {
      await onClaimHost();
    } finally {
      setBusyAction(null);
    }
  };

  const handleTransfer = async (targetUserId: string) => {
    if (busyAction) return;
    setBusyAction(`transfer:${targetUserId}`);
    try {
      await onTransferHost(targetUserId);
    } finally {
      setBusyAction(null);
    }
  };

  const handleResync = () => {
    onForceResync();
    setResynced(true);
    window.setTimeout(() => setResynced(false), 1800);
  };

  return (
    <aside
      role="dialog"
      aria-label={t("Sync · {count}", { count: room.members.length })}
      data-testid="sync-drawer"
      className="pointer-events-auto absolute end-4 top-16 z-[135] flex max-h-[calc(100%-10rem)] w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/85 text-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              syncActive ? "bg-emerald-400" : "bg-amber-400"
            }`}
            aria-hidden
          />
          <span className="truncate text-[13px] font-semibold">
            {t("Sync · {count}", { count: room.members.length })}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-medium text-white/75">
            {syncActive ? t("Synced") : t("Paused")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close sync drawer")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          <Users className="h-3 w-3" aria-hidden />
          <span>{t("Participants")}</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {room.members.map((member) => {
            const memberIsHost = member.userId === room.hostId;
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                    <span className="truncate text-[12.5px] font-medium text-white">
                      {member.displayName}
                    </span>
                    {memberIsHost ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/12 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                        <Crown className="h-2.5 w-2.5" aria-hidden />
                        {t("host")}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-white/50">@{member.handle}</p>
                </div>
                {isHost && !isSelf ? (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleTransfer(member.userId)}
                    className="shrink-0 rounded-lg border border-white/12 px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-45"
                  >
                    {t("Transfer host")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-white/10 p-3">
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => void handleCopy()}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-[12px] font-medium text-white transition-colors hover:bg-white/12 disabled:opacity-45"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          <span>
            {copied
              ? t("Invite link copied")
              : copyFailed
                ? t("Could not copy invite link")
                : t("Copy invite link")}
          </span>
        </button>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleResync}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 px-2.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span>{resynced ? t("Resync requested") : t("Force resync")}</span>
          </button>

          {!isHost ? (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleClaim()}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 px-2.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-45"
            >
              <Crown className="h-3.5 w-3.5" aria-hidden />
              <span>{t("Claim host")}</span>
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onLeaveRoom}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 text-[12px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span>{t("Leave room")}</span>
        </button>
      </div>
    </aside>
  );
}
