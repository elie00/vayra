import { ChevronsUpDown, Lock, LogIn, LogOut, Pencil, Plus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { useT } from "@/lib/i18n";
import { useProfiles, type Profile } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useVayraAccount } from "@/lib/vayra-account";

export function ProfileChip({
  collapsed = false,
  menuPlacement = "above",
}: { collapsed?: boolean; menuPlacement?: "above" | "below" } = {}) {
  const { user, signOut } = useVayraAccount();
  const { settings } = useSettings();
  const { profiles, activeProfile, openPicker, selectProfile } = useProfiles();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const otherProfiles = profiles.filter((p) => p.id !== activeProfile?.id);
  const displayName = activeProfile?.name ?? user?.email?.split("@")[0] ?? t("profile.fallback");

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={displayName}
        className={`group flex w-full items-center justify-center gap-3 rounded-xl py-2 text-start transition-[background-color,border-color] duration-150 motion-reduce:transition-none ${
          collapsed
            ? "hover:bg-elevated/60"
            : "border border-transparent hover:bg-elevated/65 min-[960px]:justify-start min-[960px]:border-edge-soft/60 min-[960px]:bg-surface/80 min-[960px]:px-2.5 min-[960px]:hover:border-edge min-[960px]:hover:bg-elevated/85"
        }`}
      >
        {/* No profile-colour ring, as on the phone: a coloured circle round the picture read as Stremio. */}
        <span className="shrink-0 rounded-full ring-1 ring-white/15">
          <ProfileAvatar profile={activeProfile} fallbackAvatar={settings.harborAvatar} compact />
        </span>
        <div className={`hidden min-w-0 flex-1 ${collapsed ? "" : "min-[960px]:block"}`}>
          <div className="truncate text-[13.5px] font-medium leading-tight tracking-[-0.01em] text-ink">
            {displayName}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-tight text-ink-subtle">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${user ? "bg-success" : "bg-ink-subtle/60"}`}
            />
            <span className="truncate">
              <SubtitleText user={user} />
            </span>
          </div>
        </div>
        {!collapsed && (
          <ChevronsUpDown
            size={14}
            strokeWidth={1.9}
            aria-hidden="true"
            className="hidden shrink-0 text-ink-subtle/75 transition-colors group-hover:text-ink-muted min-[960px]:block"
          />
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={`absolute z-[90] overflow-hidden rounded-2xl border border-edge bg-surface/96 shadow-[0_24px_48px_-14px_rgba(0,0,0,0.72)] backdrop-blur-xl ${
            menuPlacement === "below" ? "top-full mt-2" : "bottom-full mb-2"
          } ${collapsed ? "start-0 w-64" : "inset-x-0 min-w-56"}`}
        >
          {otherProfiles.length > 0 && (
            <div className="flex flex-col gap-0.5 border-b border-edge-soft/75 p-1.5">
              <span className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                {t("profile.switch")}
              </span>
              {otherProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (p.passwordHash) {
                      openPicker({ kind: "unlock", profileId: p.id });
                    } else {
                      selectProfile(p.id);
                    }
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-raised"
                >
                  <span className="relative inline-flex shrink-0">
                    <span className="rounded-full ring-1 ring-white/15">
                      <ProfileAvatar profile={p} fallbackAvatar={null} compact />
                    </span>
                    {p.passwordHash && (
                      <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink shadow-sm ring-1 ring-edge">
                        <Lock size={8} strokeWidth={2.6} />
                      </span>
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                    {p.isPrimary && (
                      <span
                        className="text-[9px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: p.color }}
                      >
                        {t("profile.primary")}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openPicker({ kind: "list" });
                setMenuOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <Users size={14} strokeWidth={2} />
              {t("profile.whoWatching")}
            </button>
            {activeProfile && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openPicker({ kind: "edit", profileId: activeProfile.id });
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <Pencil size={14} strokeWidth={2} />
                {t("profile.editThis")}
              </button>
            )}
            {activeProfile?.isPrimary && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openPicker({ kind: "create" });
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <Plus size={14} strokeWidth={2} />
                {t("profile.new")}
              </button>
            )}
            <div className="my-1 h-px bg-edge-soft/60" aria-hidden="true" />
            {user ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void signOut();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogOut size={14} strokeWidth={2} />
                {t("profile.signOut")}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAuthOpen(true);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogIn size={14} strokeWidth={2} />
                {t("Sign in to VAYRA")}
              </button>
            )}
          </div>
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

export function ProfileAvatar({
  profile,
  fallbackAvatar,
  compact,
}: {
  profile: Profile | null;
  fallbackAvatar: string | null;
  compact?: boolean;
}) {
  const dim = compact ? "h-9 w-9" : "h-11 w-11";
  const src = profile?.avatar ?? fallbackAvatar ?? null;
  return (
    <div className={`${dim} shrink-0 overflow-hidden rounded-full bg-elevated`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <CatAvatar className="h-full w-full" />
      )}
    </div>
  );
}

function SubtitleText({ user }: { user: { email?: string } | null }) {
  const t = useT();
  if (user) {
    return <>{t("VAYRA account")}</>;
  }
  return <>{t("Local profile")}</>;
}
