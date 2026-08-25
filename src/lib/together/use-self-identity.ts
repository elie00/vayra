import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";

export function useSelfIdentity(): { avatar: string | null; color: string | null } {
  const { settings } = useSettings();
  const { activeProfile } = useProfiles();
  return {
    avatar: activeProfile?.avatar ?? settings.harborAvatar ?? null,
    color: settings.harborColor || activeProfile?.color || null,
  };
}
