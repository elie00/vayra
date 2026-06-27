import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { EditorView } from "./editor-view";
import { PasswordPrompt } from "./password-prompt";
import { ProfileTile } from "./profile-tile";

export function ProfilePickerModal() {
  const { profiles, activeId, pickerOpen, pickerView, closePicker, setPickerView, selectProfile } = useProfiles();
  const t = useT();

  if (!pickerOpen) return null;

  const hasActive = !!activeId;
  const goList = () => setPickerView({ kind: "list" });

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 backdrop-blur-2xl animate-in fade-in duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
      {hasActive && (
        <button
          type="button"
          onClick={closePicker}
          style={{ position: "fixed", top: 24, right: 24, zIndex: 190 }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white/85 ring-1 ring-white/15 transition-colors hover:bg-black/75 hover:text-white"
          aria-label={t("common.close")}
        >
          <X size={18} />
        </button>
      )}
      <div className="relative flex max-h-[calc(100vh-3rem)] w-full max-w-[860px] flex-col items-center px-10 py-8 animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {pickerView.kind === "list" && (
          <ListView
            onCreate={() => setPickerView({ kind: "create" })}
            onEdit={(id) => setPickerView({ kind: "edit", profileId: id })}
            onSelect={(id) => {
              const target = profiles.find((p) => p.id === id);
              if (target?.passwordHash) {
                setPickerView({ kind: "unlock", profileId: id });
              } else {
                selectProfile(id);
              }
            }}
          />
        )}
        {pickerView.kind === "create" && <EditorView mode={{ kind: "create" }} onCancel={goList} onDone={goList} />}
        {pickerView.kind === "edit" && (() => {
          const target = profiles.find((p) => p.id === pickerView.profileId);
          if (!target) {
            return <NotFoundFallback onBack={goList} />;
          }
          return <EditorView mode={{ kind: "edit", profile: target }} onCancel={goList} onDone={goList} />;
        })()}
        {pickerView.kind === "unlock" && (() => {
          const target = profiles.find((p) => p.id === pickerView.profileId);
          if (!target || !target.passwordHash) {
            return <NotFoundFallback onBack={goList} />;
          }
          return (
            <PasswordPrompt
              profile={target}
              onSuccess={() => selectProfile(target.id)}
              onCancel={goList}
            />
          );
        })()}
      </div>
    </div>,
    document.body,
  );
}

function ListView({
  onCreate,
  onEdit,
  onSelect,
}: {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { profiles, activeProfile } = useProfiles();
  const t = useT();
  const isPrimary = !!activeProfile?.isPrimary;
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <h1 className="font-display text-[40px] font-medium tracking-tight text-ink">
          {t("Who's watching?")}
        </h1>
        <p className="text-[14px] text-ink-muted">{t("Pick a profile to continue.")}</p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-8">
        {profiles.map((p, i) => {
          const canEditThis = isPrimary || p.id === activeProfile?.id;
          return (
            <div
              key={p.id}
              className="animate-in fade-in slide-in-from-bottom-1 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ animationDelay: `${140 + Math.min(i, 8) * 55}ms`, animationFillMode: "both" }}
            >
              <ProfileTile
                profile={p}
                onSelect={() => onSelect(p.id)}
                onEdit={canEditThis ? () => onEdit(p.id) : undefined}
              />
            </div>
          );
        })}
        {isPrimary && (
          <div
            className="animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ animationDelay: `${140 + Math.min(profiles.length, 8) * 55}ms`, animationFillMode: "both" }}
          >
            <AddProfileButton onClick={onCreate} />
          </div>
        )}
      </div>
    </div>
  );
}

function AddProfileButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 outline-none"
      aria-label={t("Add profile")}
    >
      <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-edge text-ink-subtle transition-all duration-200 group-hover:scale-[1.04] group-hover:border-ink group-hover:text-ink">
        <Plus size={28} strokeWidth={2.2} />
      </span>
      <span className="text-[14px] font-medium text-ink-muted transition-colors group-hover:text-ink">
        {t("Add profile")}
      </span>
    </button>
  );
}

function NotFoundFallback({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-[14px] text-ink-muted">{t("Profile not found.")}</p>
      <button
        type="button"
        onClick={onBack}
        className="h-10 rounded-xl bg-ink px-5 text-[13px] font-semibold text-canvas"
      >
        {t("common.back")}
      </button>
    </div>
  );
}
