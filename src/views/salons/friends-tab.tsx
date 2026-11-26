import { useState } from "react";
import { Check, Copy, Link2, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { avatarUrl } from "@/lib/avatars/url";
import { CiraError, type CiraRelationship } from "@/lib/cira";
import { useCira } from "@/lib/cira/provider";
import { copyText } from "@/lib/clipboard";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";

function PresenceLabel({ presence }: { presence: CiraRelationship["presence"] }) {
  const t = useT();
  if (presence === "in_vara") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
        {t("In a room")}
      </span>
    );
  }
  if (presence === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        {t("Online")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-edge" aria-hidden />
      {t("Offline")}
    </span>
  );
}

export function FriendsTab() {
  const t = useT();
  const { relationships, repo, refresh } = useCira();

  const [addOpen, setAddOpen] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const incoming = relationships.filter(
    (r) => r.status === "pending" && r.direction === "incoming",
  );
  const friends = relationships.filter((r) => r.status === "accepted");

  const sendRequest = async () => {
    if (!repo || busy) return;
    const target = handleDraft.trim().toLowerCase().replace(/^@/, "");
    if (!target) return;
    setBusy(true);
    setNotice(null);
    try {
      await repo.sendRequest(target);
      await refresh();
      setHandleDraft("");
      setNotice({
        tone: "ok",
        text: t("If the handle can receive requests, the request was sent."),
      });
    } catch (err) {
      const code = err instanceof CiraError ? err.code : "UNKNOWN";
      setNotice({
        tone: "error",
        text:
          code === "ALREADY_RELATED"
            ? t("You're already connected with this person.")
            : code === "RATE_LIMITED"
              ? t("Too many attempts. Wait a moment and try again.")
              : t("This request can't be sent. Check the handle and try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  const createInviteLink = async () => {
    if (!repo || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const secret = await repo.createInvitation(3600);
      await copyText(secret.url);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
      setNotice({ tone: "ok", text: t("Invite link copied") });
    } catch {
      setNotice({ tone: "error", text: t("Something went wrong. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {t("Your Circle. Presence only shows for friends who share it.")}
        </p>
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          <UserPlus size={14} strokeWidth={2.2} aria-hidden />
          {t("Add a friend")}
        </button>
      </div>

      {addOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-elevated/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">{t("Add by exact handle")}</span>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              aria-label={t("common.close")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas/60 hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendRequest();
              }}
              placeholder={t("Add by handle, e.g. @marie_04")}
              spellCheck={false}
              autoComplete="off"
              className="h-10 min-w-52 flex-1 rounded-xl border border-edge bg-canvas px-3 font-mono text-[13.5px] text-ink outline-none focus:border-ink"
            />
            <button
              type="button"
              disabled={busy || handleDraft.trim().length === 0}
              onClick={() => void sendRequest()}
              className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-canvas disabled:opacity-45"
            >
              {t("Send request")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createInviteLink()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-edge-soft bg-canvas/50 px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:border-edge hover:bg-elevated"
            >
              {copiedInvite ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
              {copiedInvite ? t("Copied") : <><Copy size={12} className="hidden" aria-hidden />{t("Copy invite link")}</>}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={`text-[12.5px] ${notice.tone === "error" ? "text-danger" : "text-accent"}`}>
          {notice.text}
        </p>
      )}

      {incoming.length > 0 && repo && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Incoming requests")}
          </h3>
          {incoming.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/45 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-elevated ring-1 ring-edge-soft">
                  {r.profile.avatarKey ? (
                    <img src={avatarUrl(r.profile.avatarKey)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CatAvatar className="h-full w-full" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{r.profile.displayName}</p>
                  <p className="truncate font-mono text-[12px] text-ink-subtle">@{r.profile.handle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void repo.acceptRequest(r.id).then(refresh).finally(() => setBusy(false));
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] font-semibold text-canvas"
                >
                  {t("Accept")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void repo.declineRequest(r.id).then(refresh).finally(() => setBusy(false));
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-edge-soft px-3 text-[12px] font-medium text-ink-muted hover:text-ink"
                >
                  {t("Decline")}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {friends.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge-soft bg-canvas/35 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">{t("No friends in your Circle yet")}</p>
          <p className="max-w-md text-[12.5px] text-ink-subtle">
            {t("Add someone by exact handle or share a private invite link.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {friends.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-elevated ring-1 ring-edge-soft">
                  {r.profile.avatarKey ? (
                    <img src={avatarUrl(r.profile.avatarKey)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CatAvatar className="h-full w-full" />
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium text-ink">{r.profile.displayName}</span>
                  <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
                    <span className="font-mono">@{r.profile.handle}</span>
                    <PresenceLabel presence={r.presence} />
                  </span>
                </div>
              </div>
              {repo && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t("Remove friend")}
                    onClick={() => {
                      void confirmDialog(
                        t("Remove {name} from your Circle?", { name: r.profile.displayName }),
                      ).then((ok) => {
                        if (ok && r.profile.userId) {
                          void repo.removeFriend(r.profile.userId).then(refresh);
                        }
                      });
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-soft text-ink-subtle transition-colors hover:border-edge hover:text-ink"
                  >
                    <UserMinus size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("Block user")}
                    onClick={() => {
                      void confirmDialog(
                        t("Block {name}? They won't be able to contact you again.", {
                          name: r.profile.displayName,
                        }),
                      ).then((ok) => {
                        if (ok && r.profile.userId) {
                          void repo.blockUser(r.profile.userId).then(refresh);
                        }
                      });
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-soft text-ink-subtle transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    <ShieldOff size={14} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
