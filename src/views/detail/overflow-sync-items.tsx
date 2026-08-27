import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import anilistLogo from "@/assets/anilist.png";
import simklLogo from "@/assets/simkl.png";
import { deleteListEntry, fetchListEntry, saveListEntry } from "@/lib/anilist/mutations";
import { useAnilist } from "@/lib/anilist/provider";
import { resolveAnilistMediaId } from "@/lib/anilist/sync";
import type { MediaListStatus } from "@/lib/anilist/types";
import { resolveSimklTarget } from "@/lib/simkl/ids";
import {
  clearSimklStatus,
  loadSimklStatusMap,
  MOVIE_STATUS_ORDER,
  setSimklStatus,
  SHOW_STATUS_ORDER,
  SIMKL_STATUS_LABELS,
  statusForId,
  type WatchlistStatus,
} from "@/lib/simkl/list-status";
import { useSimkl } from "@/lib/simkl/provider";
import type { SimklTarget } from "@/lib/simkl/types";
import traktLogo from "@/assets/trakt.png";
import { useTrakt } from "@/lib/trakt/provider";
import { pushWatched } from "@/lib/trakt/history";
import { useT } from "@/lib/i18n";
import { runSyncAction } from "@/lib/sync-action";

const ANILIST_LABELS: Record<MediaListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Plan to Watch",
  COMPLETED: "Completed",
  REPEATING: "Rewatching",
  PAUSED: "On Hold",
  DROPPED: "Dropped",
};

const ANILIST_ORDER: MediaListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "REPEATING",
  "PAUSED",
  "DROPPED",
];

function GroupRow({
  logo,
  label,
  open,
  busy,
  onClick,
}: {
  logo: string;
  label: string;
  open: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      disabled={busy}
      onClick={onClick}
      className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-start text-[13px] text-ink transition-colors hover:bg-raised disabled:opacity-60"
    >
      <img src={logo} alt="" className="h-[14px] w-[14px] rounded-[3px] object-contain" />
      <span className="flex-1 truncate">{label}</span>
      {busy ? (
        <Loader2 size={13} className="animate-spin text-ink-muted" />
      ) : (
        <ChevronDown
          size={13}
          className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      )}
    </button>
  );
}

function StatusRow({
  label,
  active,
  danger,
  busy,
  onClick,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      disabled={busy}
      onClick={onClick}
      className={`flex h-8 items-center justify-between gap-2 rounded-lg py-1 ps-9 pe-3 text-start text-[12.5px] transition-colors ${
        danger
          ? "text-ink-muted hover:bg-danger/15 hover:text-danger"
          : active
            ? "text-ink"
            : "text-ink-muted hover:bg-raised hover:text-ink"
      } disabled:opacity-60`}
    >
      <span className="flex items-center gap-2">
        {danger && <Trash2 size={12} />}
        {label}
      </span>
      {busy ? (
        <Loader2 size={13} className="animate-spin text-ink-muted" />
      ) : (
        active && <Check size={13} className="text-ink" />
      )}
    </button>
  );
}

function SyncError({ visible }: { visible: boolean }) {
  const t = useT();
  if (!visible) return null;
  return (
    <div className="mx-2 my-1 rounded-lg border border-danger/25 bg-danger/8 px-2.5 py-2 text-[11.5px] text-danger">
      <span className="font-medium">{t("Something went wrong. Try again.")}</span>
    </div>
  );
}

function useConfirmedSyncAction(onAction: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const busyRef = useRef(false);

  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    const result = await runSyncAction(action);
    busyRef.current = false;
    setBusy(false);
    if (result.ok) {
      onAction();
    } else {
      console.error("[detail-sync] remote action failed:", result.message);
      setError(true);
    }
  };

  return { busy, error, run };
}

export function SimklMenuItems({
  harborId,
  type,
  onAction,
}: {
  harborId: string;
  type: "movie" | "series";
  onAction: () => void;
}) {
  const t = useT();
  const { isConnected } = useSimkl();
  const [target, setTarget] = useState<SimklTarget | null>(null);
  const [status, setStatus] = useState<WatchlistStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const sync = useConfirmedSyncAction(onAction);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    setTarget(null);
    setStatus(null);
    setReady(false);
    setLoadError(false);
    void (async () => {
      try {
        const t = await resolveSimklTarget(harborId, type);
        if (cancelled || !t) return;
        setTarget(t);
        const malKey = "ids" in t && t.ids.mal != null ? `mal:${t.ids.mal}` : null;
        const m = await loadSimklStatusMap();
        if (cancelled) return;
        setStatus(statusForId(m, harborId) ?? (malKey ? statusForId(m, malKey) : null));
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("[detail-sync] failed to load Simkl status:", error);
          setLoadError(true);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, isConnected, type]);

  if (!isConnected || !ready) return null;
  if (loadError) return <SyncError visible />;
  if (!target) return null;
  const order = target.kind === "movie" ? MOVIE_STATUS_ORDER : SHOW_STATUS_ORDER;

  if (status == null) {
    return (
      <>
        <GroupRow
          logo={simklLogo}
          label={t("Add to Simkl")}
          open={false}
          busy={sync.busy}
          onClick={() => void sync.run(() => setSimklStatus(target, "plantowatch"))}
        />
        <SyncError visible={sync.error} />
      </>
    );
  }
  return (
    <>
      <GroupRow
        logo={simklLogo}
        label={`Simkl  ·  ${t(SIMKL_STATUS_LABELS[status])}`}
        open={open}
        busy={sync.busy}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <>
          {order.map((s) => (
            <StatusRow
              key={s}
              label={t(SIMKL_STATUS_LABELS[s])}
              active={s === status}
              busy={sync.busy}
              onClick={() => void sync.run(() => setSimklStatus(target, s))}
            />
          ))}
          <StatusRow
            label={t("Remove from list")}
            danger
            busy={sync.busy}
            onClick={() => void sync.run(() => clearSimklStatus(target))}
          />
          <SyncError visible={sync.error} />
        </>
      )}
    </>
  );
}

export function AnilistMenuItems({
  harborId,
  onAction,
}: {
  harborId: string;
  onAction: () => void;
}) {
  const t = useT();
  const { isConnected } = useAnilist();
  const [mediaId, setMediaId] = useState<number | null>(null);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [status, setStatus] = useState<MediaListStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const sync = useConfirmedSyncAction(onAction);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    setMediaId(null);
    setEntryId(null);
    setStatus(null);
    setReady(false);
    setLoadError(false);
    (async () => {
      try {
        const id = await resolveAnilistMediaId(harborId);
        if (cancelled) return;
        if (id == null) {
          setReady(true);
          return;
        }
        setMediaId(id);
        const info = await fetchListEntry(id);
        if (cancelled) return;
        setEntryId(info?.entry?.id ?? null);
        setStatus(info?.entry?.status ?? null);
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("[detail-sync] failed to load AniList status:", error);
          setLoadError(true);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, isConnected]);

  if (!isConnected || !ready) return null;
  if (loadError) return <SyncError visible />;
  if (mediaId == null) return null;

  if (status == null) {
    return (
      <>
        <GroupRow
          logo={anilistLogo}
          label={t("Add to AniList")}
          open={false}
          busy={sync.busy}
          onClick={() => void sync.run(() => saveListEntry({ mediaId, status: "PLANNING" }))}
        />
        <SyncError visible={sync.error} />
      </>
    );
  }
  return (
    <>
      <GroupRow
        logo={anilistLogo}
        label={`AniList  ·  ${t(ANILIST_LABELS[status])}`}
        open={open}
        busy={sync.busy}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <>
          {ANILIST_ORDER.map((s) => (
            <StatusRow
              key={s}
              label={t(ANILIST_LABELS[s])}
              active={s === status}
              busy={sync.busy}
              onClick={() => void sync.run(() => saveListEntry({ mediaId, status: s }))}
            />
          ))}
          {entryId != null && (
            <StatusRow
              label={t("Remove from list")}
              danger
              busy={sync.busy}
              onClick={() => void sync.run(() => deleteListEntry(entryId))}
            />
          )}
          <SyncError visible={sync.error} />
        </>
      )}
    </>
  );
}

export function TraktMenuItems({
  harborId,
  type,
  onAction,
}: {
  harborId: string;
  type: "movie" | "series";
  onAction: () => void;
}) {
  const t = useT();
  const { isConnected, resolveTarget } = useTrakt();
  const sync = useConfirmedSyncAction(onAction);
  if (!isConnected || type !== "movie") return null;
  const target = resolveTarget(harborId);
  if (!target || target.kind !== "movie") return null;
  return (
    <>
      <button
        role="menuitem"
        disabled={sync.busy}
        onClick={() => void sync.run(() => pushWatched(target))}
        className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-start text-[13px] text-ink transition-colors hover:bg-raised disabled:opacity-60"
      >
        <img src={traktLogo} alt="" className="h-[14px] w-[14px] rounded-[3px] object-contain" />
        <span className="flex-1 truncate">{t("Mark watched on Trakt")}</span>
        {sync.busy && <Loader2 size={13} className="animate-spin text-ink-muted" />}
      </button>
      <SyncError visible={sync.error} />
    </>
  );
}
