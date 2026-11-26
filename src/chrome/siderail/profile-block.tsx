import { LogOut, Pencil, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useVayraAccount } from "@/lib/vayra-account";
import { useView } from "@/lib/view";

export function ProfileBlock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, signOut } = useVayraAccount();
  const { settings } = useSettings();
  const { activeProfile } = useProfiles();
  const { openSettings } = useView();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const name =
    activeProfile?.name ?? user?.email?.split("@")[0] ?? t("profile.fallback");
  const color = activeProfile?.color ?? "var(--color-accent)";
  const avatar = activeProfile?.avatar ?? settings.harborAvatar;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-elevated/50"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-edge-soft"
          style={{ background: color }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <CatAvatar className="h-full w-full" />
          )}
        </span>
        <span className="truncate text-[13px] text-ink">{name}</span>
      </button>
      {open && (
        <div className="absolute bottom-full start-0 end-0 mb-2 overflow-hidden rounded-xl border border-edge bg-[#1a1d28] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)]">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-[13px] font-semibold text-ink">{name}</div>
            {user?.email && (
              <div className="truncate text-[11.5px] text-ink-subtle">{user.email}</div>
            )}
          </div>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                openSettings("account");
                setOpen(false);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
            >
              <Pencil size={13} strokeWidth={2.2} /> {t("Edit profile")}
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                setOpen(false);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
            >
              <SettingsIcon size={13} strokeWidth={2.2} /> {t("nav.settings")}
            </button>
            {user && (
              <button
                type="button"
                onClick={() => {
                  void signOut();
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 border-t border-white/10 px-4 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
              >
                <LogOut size={13} strokeWidth={2.2} /> {t("Sign out")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
