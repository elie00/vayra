import { useSyncExternalStore } from "react";
import { secretStorageDegraded, subscribeSecretStorage } from "@/lib/settings/secret-vault";
import { useT } from "@/lib/i18n";

export function SecretStorageWarning() {
  const degraded = useSyncExternalStore(subscribeSecretStorage, secretStorageDegraded);
  const t = useT();
  if (!degraded) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-12 z-[240] mx-auto max-w-xl rounded-xl border border-danger/45 bg-elevated px-4 py-3 text-sm text-ink shadow-lg">
      {t("Secure storage is unavailable. Your keys are kept in local settings. Restart VAYRA after unlocking the keychain to restore protection.")}
    </div>
  );
}
