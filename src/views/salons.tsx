import { useRef, useState } from "react";
import { RadioTower, Settings as SettingsIcon, Users } from "lucide-react";
import { useCira } from "@/lib/cira/provider";
import { useT } from "@/lib/i18n";
import { hasNativeDesktopUx } from "@/lib/platform";
import { useVara } from "@/lib/vara/provider";
import { useScrollMemory, useView } from "@/lib/view";
import { FriendsTab } from "./salons/friends-tab";
import { GroupsTab } from "./salons/groups-tab";
import { SalonsTab } from "./salons/salons-tab";

type SalonsSubTab = "rooms" | "groups" | "friends";

export function SalonsView({ active }: { active: boolean }) {
  const t = useT();
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("salons", scrollRef, active);

  const { status, me, autoProvisioning, retryProvision, inbox } = useCira();
  const { invitations, activeRoom } = useVara();
  const { openSettings } = useView();
  const [tab, setTab] = useState<SalonsSubTab>("rooms");

  const tabs: Array<{ id: SalonsSubTab; label: string; count?: number }> = [
    { id: "rooms", label: t("nav.salons"), count: invitations.length > 0 ? invitations.length : undefined },
    { id: "groups", label: t("Groups"), count: (inbox?.groupInvitationCount ?? 0) > 0 ? inbox?.groupInvitationCount : undefined },
    { id: "friends", label: t("Friends"), count: (inbox?.friendRequestCount ?? 0) > 0 ? inbox?.friendRequestCount : undefined },
  ];

  return (
    <main
      ref={scrollRef}
      className={`flex-1 overflow-y-auto px-5 pb-14 sm:px-8 lg:px-12 max-sm:pt-[calc(5rem+var(--harbor-status-bar,1.75rem))] ${
        hasNativeDesktopUx() ? "pt-16 lg:pt-20" : "pt-24 lg:pt-28"
      }`}
    >
      <div data-tauri-drag-region className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="vayra-kicker">{t("Circle")}</span>
              <h1 className="mac-page-title">{t("nav.salons")}</h1>
              <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-muted">
                {t("Private synchronized watch rooms, shared collections, and your close Circle.")}
              </p>
            </div>
            {me && (
              <div className="flex items-center gap-2">
                {activeRoom && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-[12px] font-medium text-success ring-1 ring-success/25">
                    <RadioTower size={12} aria-hidden />
                    {t("Room active")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openSettings("cira")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-edge-soft bg-canvas/45 px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
                >
                  <SettingsIcon size={13} aria-hidden />
                  {t("Circle settings")}
                </button>
              </div>
            )}
          </div>

          {me && (
            <div
              role="tablist"
              aria-label={t("nav.salons")}
              className="flex flex-wrap items-center gap-1.5"
            >
              {tabs.map((item) => {
                const selected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(item.id)}
                    className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                      selected
                        ? "bg-ink text-canvas"
                        : "bg-elevated/60 text-ink-muted ring-1 ring-edge-soft/70 hover:bg-elevated hover:text-ink"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.count != null && item.count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10.5px] leading-none tabular-nums ${
                          selected ? "bg-canvas/20 text-canvas" : "bg-ink text-canvas"
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {status === "signedOut" ? (
          <section className="flex flex-col items-start gap-3 rounded-2xl border border-edge-soft bg-elevated/40 p-6">
            <Users size={22} className="text-ink-muted" aria-hidden />
            <div className="flex flex-col gap-1">
              <h2 className="text-[16px] font-semibold text-ink">
                {t("Sign in to your VAYRA account")}
              </h2>
              <p className="max-w-[52ch] text-[13.5px] text-ink-muted">
                {t("Rooms, shared collections, and your Circle are tied to your private VAYRA identity.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openSettings("account")}
              className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
            >
              {t("Go to Account")}
            </button>
          </section>
        ) : status === "restricted" || status === "unavailable" ? (
          <section className="flex flex-col items-start gap-3 rounded-2xl border border-edge-soft bg-elevated/40 p-6">
            <h2 className="text-[16px] font-semibold text-ink">{t("Private beta access")}</h2>
            <p className="max-w-[54ch] text-[13.5px] text-ink-muted">
              {t("Rooms and Circle are currently limited to invited beta accounts.")}
            </p>
            <button
              type="button"
              onClick={() => openSettings("cira")}
              className="inline-flex h-10 items-center rounded-xl border border-edge-soft bg-canvas/60 px-4 text-[13px] font-medium text-ink transition-colors hover:border-edge hover:bg-elevated"
            >
              {t("Circle settings")}
            </button>
          </section>
        ) : status === "loading" || (!me && autoProvisioning) ? (
          <p className="text-[13.5px] text-ink-subtle">
            {autoProvisioning ? t("Setting up your VAYRA identity…") : t("Loading…")}
          </p>
        ) : !me ? (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-elevated/40 p-5">
            <p className="text-[13px] text-ink-muted">
              {t("Your Circle identity could not be prepared automatically.")}
            </p>
            <button
              type="button"
              onClick={() => void retryProvision()}
              className="inline-flex h-9 items-center rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-canvas"
            >
              {t("Try again")}
            </button>
          </section>
        ) : (
          <>
            {tab === "rooms" && <SalonsTab />}
            {tab === "groups" && <GroupsTab onRoomStarted={() => setTab("rooms")} />}
            {tab === "friends" && <FriendsTab />}
          </>
        )}
      </div>
    </main>
  );
}
