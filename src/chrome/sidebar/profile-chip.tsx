import { ChevronsUpDown, LogIn, LogOut, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { useT } from "@/lib/i18n";
import { useProfiles, type Profile } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useVayraAccount } from "@/lib/vayra-account";
import { useView } from "@/lib/view";

export function ProfileChip({
  collapsed = false,
  menuPlacement = "above",
}: { collapsed?: boolean; menuPlacement?: "above" | "below" } = {}) {
  const { user, signOut } = useVayraAccount();
  const { settings } = useSettings();
  const { activeProfile } = useProfiles();
  const { openSettings } = useView();
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
          <div className="flex flex-col p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openSettings("account");
                setMenuOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <Pencil size={14} strokeWidth={2} />
              {t("Edit profile")}
            </button>
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
