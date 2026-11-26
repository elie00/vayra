import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import stremioWordmark from "@/assets/stremio-wordmark.png";
import { AuthModal, StremioAuthModal } from "@/components/auth-modal";
import { AvatarFan } from "@/components/avatar-picker/avatar-fan";
import { useAuth } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatars/url";
import { CiraError } from "@/lib/cira";
import { sanitizeCiraAvatarKey } from "@/lib/cira/auto-profile";
import { useCira } from "@/lib/cira/provider";
import { useT } from "@/lib/i18n";
import { isMobileTauri } from "@/lib/platform";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useTogether } from "@/lib/together/provider";
import { useVayraAccount } from "@/lib/vayra-account";
import { AvatarRing } from "./account/avatar-ring";
import { resizeAvatar } from "./account/avatar-utils";
import { SyncedAddonsCard } from "./account/synced-addons-card";
import { ColorPicker } from "./color-picker";
import { Section } from "./shared";

const AvatarCatalogModal = lazy(() =>
  import("@/components/avatar-picker/avatar-catalog-modal").then((m) => ({ default: m.AvatarCatalogModal })),
);

const HANDLE_RX = /^[a-z0-9][a-z0-9_]{2,23}$/;

export function AccountStub() {
  const t = useT();
  const { user, signOut } = useAuth();
  const {
    configured: vayraAccountConfigured,
    loading: vayraAccountLoading,
    user: vayraUser,
    signOut: signOutVayra,
    deleteAccount: deleteVayraAccount,
  } = useVayraAccount();
  const { settings, update } = useSettings();
  const { displayName, setDisplayName } = useTogether();
  const { activeProfile, updateProfile } = useProfiles();
  const cira = useCira();

  const [handleDraft, setHandleDraft] = useState(cira.me?.handle ?? "");
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleNotice, setHandleNotice] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  useEffect(() => {
    setHandleDraft(cira.me?.handle ?? "");
  }, [cira.me?.handle]);

  const syncCiraIdentity = (patch: { displayName?: string; avatarKey?: string | null }) => {
    if (!cira.me) return;
    const nextName = (patch.displayName ?? cira.me.displayName).trim();
    if (!nextName) return;
    const nextAvatar =
      patch.avatarKey !== undefined ? sanitizeCiraAvatarKey(patch.avatarKey) : cira.me.avatarKey;
    void cira
      .saveProfile({
        handle: cira.me.handle,
        displayName: nextName.slice(0, 48),
        avatarKey: nextAvatar,
      })
      .catch(() => undefined);
  };

  const pushIdentity = (
    patch: { harborColor?: string; harborAvatar?: string | null },
    ciraAvatarKey?: string | null,
  ) => {
    update(patch);
    if (activeProfile) {
      const profilePatch: { color?: string; avatar?: string | null } = {};
      if (patch.harborColor !== undefined) profilePatch.color = patch.harborColor;
      if (patch.harborAvatar !== undefined) profilePatch.avatar = patch.harborAvatar;
      if (Object.keys(profilePatch).length > 0) updateProfile(activeProfile.id, profilePatch);
    }
    if (ciraAvatarKey !== undefined) {
      syncCiraIdentity({ avatarKey: ciraAvatarKey });
    }
  };
  const pushDisplayName = (next: string) => {
    setDisplayName(next);
    if (activeProfile && next && next !== activeProfile.name) {
      updateProfile(activeProfile.id, { name: next });
    }
    syncCiraIdentity({ displayName: next });
  };

  const normalizedHandle = handleDraft.trim().toLowerCase().replace(/^@/, "");
  const handleValid = HANDLE_RX.test(normalizedHandle);
  const saveHandle = async () => {
    if (!cira.me || !handleValid || handleBusy) return;
    if (normalizedHandle === cira.me.handle) {
      setEditingHandle(false);
      return;
    }
    setHandleBusy(true);
    setHandleNotice(null);
    try {
      await cira.saveProfile({
        handle: normalizedHandle,
        displayName: (displayName || cira.me.displayName).trim().slice(0, 48),
        avatarKey: cira.me.avatarKey,
      });
      setEditingHandle(false);
      setHandleNotice({ text: t("Saved"), tone: "ok" });
    } catch (err) {
      const code = err instanceof CiraError ? err.code : "UNKNOWN";
      const msg =
        code === "HANDLE_UNAVAILABLE"
          ? t("That handle is already taken.")
          : code === "RATE_LIMITED"
            ? t("Too many attempts. Wait a moment and try again.")
            : code === "INVALID_PROFILE"
              ? t("That handle or display name isn't valid.")
              : t("Something went wrong. Try again.");
      setHandleNotice({ text: msg, tone: "error" });
    } finally {
      setHandleBusy(false);
    }
  };
  const [showVayraAuth, setShowVayraAuth] = useState(false);
  const [showStremioAuth, setShowStremioAuth] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  const harborAvatar = settings.harborAvatar;
  const customAvatar = activeProfile?.avatar ?? harborAvatar ?? null;
  const effectiveAvatar = customAvatar;

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await resizeAvatar(file, 320);
      pushIdentity({ harborAvatar: dataUrl }, null);
    } catch (err) {
      console.warn("[avatar] resize failed", err);
    }
  };

  const maskedEmail = useMemo(() => {
    if (!user?.email) return "";
    const [local, domain] = user.email.split("@");
    if (!domain) return "*****";
    const visible = local.slice(0, 1);
    return `${visible}${"*".repeat(Math.max(local.length - 1, 4))}@${domain}`;
  }, [user]);

  const deleteConfirm = (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        {t("This cannot be undone. Type DELETE VAYRA to confirm the permanent deletion of your remote account.")}
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("Type DELETE VAYRA to confirm")}
        </span>
        <input
          value={deletePhrase}
          onChange={(event) => setDeletePhrase(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-10 rounded-xl border border-danger/30 bg-canvas px-3 font-mono text-[13px] text-ink outline-none focus:border-danger"
        />
      </label>
      {deleteError && <p role="alert" className="text-[12px] text-danger">{deleteError}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setDeleteOpen(false);
            setDeletePhrase("");
            setDeleteError(null);
          }}
          disabled={deletePending}
          className="h-10 rounded-xl border border-edge-soft px-4 text-[12.5px] font-medium text-ink-muted"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          disabled={deletePhrase !== "DELETE VAYRA" || deletePending}
          onClick={() => {
            setDeletePending(true);
            setDeleteError(null);
            void deleteVayraAccount()
              .then(() => {
                setDeleteOpen(false);
                setDeletePhrase("");
              })
              .catch(() => setDeleteError(t("Account deletion failed. Please retry.")))
              .finally(() => setDeletePending(false));
          }}
          className="h-10 rounded-xl bg-danger px-4 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deletePending ? t("Deleting…") : t("Permanently delete")}
        </button>
      </div>
    </div>
  );

  const modals = (
    <>
      {showVayraAuth && <AuthModal onClose={() => setShowVayraAuth(false)} />}
      {showStremioAuth && <StremioAuthModal onClose={() => setShowStremioAuth(false)} />}
      {avatarPickerOpen && (
        <Suspense fallback={null}>
          <AvatarCatalogModal
            current={effectiveAvatar}
            onPick={(id) => {
              pushIdentity({ harborAvatar: avatarUrl(id) }, id);
              setAvatarPickerOpen(false);
            }}
            onClose={() => setAvatarPickerOpen(false)}
          />
        </Suspense>
      )}
    </>
  );

  // On a phone, who you are and the VAYRA account behind it are one card,
  // then profiles, Stremio, and deleting the account last. The add-ons synced
  // from Stremio are managed on the Add-ons page.
  if (isMobileTauri()) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-elevated px-4 py-6">
          <AvatarRing src={effectiveAvatar} size={96} onClick={() => setAvatarPickerOpen(true)} />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onPickFile} className="hidden" />
          {editingName ? (
            <div className="flex w-full items-center gap-2">
              <NameDraftInput
                value={nameDraft}
                onChange={setNameDraft}
                onSave={() => {
                  pushDisplayName(nameDraft.trim() || displayName);
                  setEditingName(false);
                }}
                onCancel={() => {
                  setNameDraft(displayName);
                  setEditingName(false);
                }}
                className="h-12 min-w-0 flex-1 rounded-xl border border-edge bg-canvas px-3 type-body font-semibold text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  pushDisplayName(nameDraft.trim() || displayName);
                  setEditingName(false);
                }}
                className="h-12 shrink-0 rounded-xl bg-ink px-4 type-callout font-semibold text-canvas"
              >
                {t("Save")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="-my-2 flex min-h-12 max-w-full items-center gap-2 rounded-xl px-3 active:bg-raised"
            >
              <span className="truncate type-title-2 font-semibold text-ink">{displayName}</span>
              <Pencil size={16} className="shrink-0 text-ink-subtle" />
            </button>
          )}
          <p className="-mt-2 max-w-full truncate type-footnote text-ink-muted">
            {vayraAccountLoading ? t("Checking account…") : vayraUser?.email ?? t("Local profile")}
          </p>
          {vayraUser && cira.me && (
            editingHandle ? (
              <div className="flex w-full flex-col gap-1.5">
                <div className="flex w-full items-center gap-2">
                  <input
                    value={handleDraft}
                    onChange={(e) => {
                      setHandleDraft(e.target.value);
                      setHandleNotice(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveHandle();
                      if (e.key === "Escape") {
                        setHandleDraft(cira.me?.handle ?? "");
                        setEditingHandle(false);
                      }
                    }}
                    placeholder={t("e.g. marie_04")}
                    spellCheck={false}
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-edge bg-canvas px-3 font-mono text-[13.5px] text-ink outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    onClick={() => void saveHandle()}
                    disabled={!handleValid || handleBusy}
                    className="h-11 shrink-0 rounded-xl bg-ink px-4 type-callout font-semibold text-canvas disabled:opacity-45"
                  >
                    {handleBusy ? t("Saving…") : t("Save")}
                  </button>
                </div>
                {handleDraft.length > 0 && !handleValid && (
                  <span className="text-[11.5px] text-ink-subtle">
                    {t("3-24 characters: lowercase letters, digits, underscore.")}
                  </span>
                )}
                {handleNotice && (
                  <span className={`text-[12px] ${handleNotice.tone === "error" ? "text-danger" : "text-accent"}`}>
                    {handleNotice.text}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setHandleDraft(cira.me?.handle ?? "");
                  setHandleNotice(null);
                  setEditingHandle(true);
                }}
                aria-label={t("Change handle")}
                className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 font-mono text-[12.5px] text-ink-muted"
              >
                <span>@{cira.me.handle}</span>
                <Pencil size={12} className="text-ink-subtle" />
              </button>
            )
          )}
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" onClick={() => setAvatarPickerOpen(true)} className="h-11 rounded-full bg-raised px-3 type-footnote font-medium text-ink">
              {t("Choose avatar")}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="h-11 rounded-full bg-raised px-3 type-footnote font-medium text-ink">
              {t("Upload photo")}
            </button>
          </div>
          <div className="w-full">
            <ColorPicker value={settings.harborColor} onChange={(c) => pushIdentity({ harborColor: c })} />
          </div>
          <div className="flex w-full flex-col gap-2 border-t border-edge-soft/60 pt-4">
            {vayraUser ? (
              <button type="button" onClick={() => void signOutVayra()} className="h-12 rounded-full border border-edge-soft type-callout font-medium text-ink-muted">
                {t("Sign out")}
              </button>
            ) : (
              <>
                <p className="text-center type-footnote text-ink-muted">
                  {vayraAccountConfigured
                    ? t("Sign in or create an account with your email address.")
                    : t("Email sign-in is not configured in this build yet.")}
                </p>
                <button
                  type="button"
                  onClick={() => setShowVayraAuth(true)}
                  disabled={!vayraAccountConfigured || vayraAccountLoading}
                  className="h-12 rounded-full bg-ink type-callout font-semibold text-canvas disabled:opacity-45"
                >
                  {t("Continue with email")}
                </button>
              </>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="type-title-3 font-semibold text-ink">Stremio</h3>
          <div className="flex flex-col gap-3 rounded-2xl bg-elevated p-4">
            <p className="break-words type-footnote text-ink-muted">
              {user ? maskedEmail : t("Connect it only if you want to import or export your library, watch progress, and addons.")}
            </p>
            {user ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setShowStremioAuth(true)} className="h-11 rounded-full bg-raised px-3 type-footnote font-medium text-ink">
                  {t("Re-authenticate")}
                </button>
                <button type="button" onClick={signOut} className="h-11 rounded-full bg-raised px-3 type-footnote font-medium text-ink-muted">
                  {t("Disconnect Stremio")}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowStremioAuth(true)} className="h-12 rounded-full bg-raised type-callout font-semibold text-ink">
                {t("Connect Stremio")}
              </button>
            )}
          </div>
        </section>

        {vayraUser &&
          (deleteOpen ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">{deleteConfirm}</div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="h-12 self-center px-4 type-footnote font-medium text-danger"
            >
              {t("Delete VAYRA account")}
            </button>
          ))}
        {modals}
      </div>
    );
  }

  // Three sections, each named once: the single unified Account Profile,
  // the VAYRA account connection, and optional Stremio sync.
  return (
    <div className="flex flex-col gap-5">
      <Section
        title={t("Profile")}
        subtitle={t("One identity across VAYRA, CIRA, VARA, and LUMA.")}
      >
        <div className="flex flex-col gap-5 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex items-center gap-5">
            <AvatarRing
              src={effectiveAvatar}
              size={88}
              onClick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onPickFile}
              className="hidden"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <NameDraftInput
                    value={nameDraft}
                    onChange={setNameDraft}
                    onSave={() => {
                      pushDisplayName(nameDraft.trim() || displayName);
                      setEditingName(false);
                    }}
                    onCancel={() => {
                      setNameDraft(displayName);
                      setEditingName(false);
                    }}
                    className="h-10 flex-1 rounded-xl border border-ink bg-elevated px-3 text-[15px] font-semibold text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      pushDisplayName(nameDraft.trim() || displayName);
                      setEditingName(false);
                    }}
                    className="h-10 rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-canvas"
                  >
                    {t("Save")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0 self-start rounded-lg px-1 py-0.5 text-start transition-colors hover:bg-canvas/50"
                >
                  <span className="font-display text-[24px] font-medium leading-tight tracking-tight text-ink">
                    {displayName}
                  </span>
                  {vayraUser?.email && !cira.me && (
                    <span className="text-[13px] text-ink-subtle">
                      ({vayraUser.email.split("@")[0]})
                    </span>
                  )}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink-subtle">
                    <path
                      d="M16.5 4.5l3 3-11 11H5.5v-3l11-11z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}

              {vayraUser && (cira.me || cira.autoProvisioning || cira.autoProvisionError) && (
                <div className="flex flex-col gap-1.5">
                  {cira.autoProvisioning ? (
                    <span className="text-[12.5px] text-ink-subtle">{t("Setting up handle…")}</span>
                  ) : cira.me ? (
                    editingHandle ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex max-w-sm items-center gap-2">
                          <input
                            value={handleDraft}
                            onChange={(e) => {
                              setHandleDraft(e.target.value);
                              setHandleNotice(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveHandle();
                              if (e.key === "Escape") {
                                setHandleDraft(cira.me?.handle ?? "");
                                setEditingHandle(false);
                              }
                            }}
                            placeholder={t("e.g. marie_04")}
                            spellCheck={false}
                            autoComplete="off"
                            className="h-9 min-w-0 flex-1 rounded-lg border border-edge bg-elevated px-3 font-mono text-[13px] text-ink outline-none focus:border-ink"
                          />
                          <button
                            type="button"
                            onClick={() => void saveHandle()}
                            disabled={!handleValid || handleBusy}
                            className="h-9 shrink-0 rounded-lg bg-ink px-3.5 text-[12px] font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {handleBusy ? t("Saving…") : t("Save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHandleDraft(cira.me?.handle ?? "");
                              setHandleNotice(null);
                              setEditingHandle(false);
                            }}
                            className="h-9 shrink-0 rounded-lg border border-edge-soft px-3 text-[12px] font-medium text-ink-muted hover:text-ink"
                          >
                            {t("Cancel")}
                          </button>
                        </div>
                        {handleDraft.length > 0 && !handleValid && (
                          <span className="text-[11.5px] text-ink-subtle">
                            {t("3-24 characters: lowercase letters, digits, underscore.")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHandleDraft(cira.me?.handle ?? "");
                            setHandleNotice(null);
                            setEditingHandle(true);
                          }}
                          aria-label={t("Change handle")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-edge-soft bg-elevated/60 px-2.5 py-1 font-mono text-[12.5px] text-ink-muted transition-colors hover:border-edge hover:text-ink"
                        >
                          <span>@{cira.me.handle}</span>
                          <Pencil size={11} className="text-ink-subtle" />
                        </button>
                        {handleNotice && (
                          <span className={`text-[12px] ${handleNotice.tone === "error" ? "text-danger" : "text-accent"}`}>
                            {handleNotice.text}
                          </span>
                        )}
                      </div>
                    )
                  ) : cira.autoProvisionError ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink-subtle">
                        {t("Your CIRA profile could not be prepared automatically.")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void cira.retryProvision()}
                        className="text-[12px] font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {t("Retry setup")}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  {t("Upload photo")}
                </button>
                {customAvatar && (
                  <button
                    type="button"
                    onClick={() => pushIdentity({ harborAvatar: null }, null)}
                    className="flex h-9 items-center rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-subtle transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    {t("Reset to default")}
                  </button>
                )}
              </div>
              <AvatarFan
                onClick={() => setAvatarPickerOpen(true)}
                onRandomize={(id) => pushIdentity({ harborAvatar: avatarUrl(id) }, id)}
              />
              <ColorPicker
                value={settings.harborColor}
                onChange={(c) => pushIdentity({ harborColor: c })}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={t("VAYRA account")}
        subtitle={t("Your private VAYRA identity, connected with a passwordless email link.")}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[14px] font-medium text-ink">
                {vayraAccountLoading
                  ? t("Checking account…")
                  : vayraUser?.email ?? t("No VAYRA account connected")}
              </span>
              <span className="text-[12.5px] text-ink-subtle">
                {vayraUser
                  ? t("Connected by email. Stremio remains a separate service.")
                  : vayraAccountConfigured
                    ? t("Sign in or create an account with your email address.")
                    : t("Email sign-in is not configured in this build yet.")}
              </span>
            </div>
            {vayraUser ? (
              <button
                onClick={() => void signOutVayra()}
                className="flex h-10 shrink-0 items-center rounded-xl border border-edge-soft px-4 text-[12.5px] font-medium text-ink-subtle transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                {t("Sign out")}
              </button>
            ) : (
              <button
                onClick={() => setShowVayraAuth(true)}
                disabled={!vayraAccountConfigured || vayraAccountLoading}
                className="flex h-10 shrink-0 items-center rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t("Continue with email")}
              </button>
            )}
          </div>
          {vayraUser &&
            (deleteOpen ? (
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">{deleteConfirm}</div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                className="self-start text-[12.5px] font-medium text-danger/80 transition-colors hover:text-danger"
              >
                {t("Delete VAYRA account")}
              </button>
            ))}
        </div>
      </Section>

      <Section
        title="Stremio"
        subtitle={t("Optional. Import or export your Stremio library, watch progress, and addon collection.")}
      >
        {user ? (
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-edge-soft bg-canvas/40 p-5">
            <img
              src={stremioWordmark}
              alt=""
              aria-hidden
              className="pointer-events-none absolute end-5 bottom-4 h-9 w-auto opacity-45 select-none"
              style={{ filter: "invert(1) grayscale(1) brightness(1.1)" }}
              draggable={false}
            />
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  {t("Email")}
                </span>
                <span className="truncate font-mono text-[14.5px] text-ink">
                  {reveal ? user.email : maskedEmail}
                </span>
              </div>
              <button
                onClick={() => setReveal((v) => !v)}
                className="flex h-9 shrink-0 items-center rounded-lg border border-edge-soft px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
              >
                {reveal ? t("Hide") : t("Reveal")}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  {t("Stremio ID")}
                </span>
                <span className="truncate font-mono text-[12.5px] text-ink-muted">{user._id}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 border-t border-edge-soft/60 pt-3">
              <button
                onClick={() => setShowStremioAuth(true)}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-edge-soft px-4 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
              >
                {t("Re-authenticate")}
              </button>
              <button
                onClick={signOut}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-edge-soft px-4 text-[12.5px] font-medium text-ink-subtle transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                {t("Disconnect Stremio")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
            <div className="flex flex-col">
              <span className="text-[14px] font-medium text-ink">{t("Stremio is not connected")}</span>
              <span className="text-[12.5px] text-ink-subtle">
                {t("Connect it only if you want to import or export your library, watch progress, and addons.")}
              </span>
            </div>
            <button
              onClick={() => setShowStremioAuth(true)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02]"
            >
              {t("Connect Stremio")}
            </button>
          </div>
        )}
        <SyncedAddonsCard />
      </Section>

      {modals}
    </div>
  );
}

/** The profile name being edited; it takes focus because the user just asked to edit it. */
function NameDraftInput({
  value,
  onChange,
  onSave,
  onCancel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className: string;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave();
        if (e.key === "Escape") onCancel();
      }}
      className={className}
    />
  );
}
