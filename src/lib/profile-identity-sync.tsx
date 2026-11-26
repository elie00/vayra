import { useEffect } from "react";
import { useCira } from "./cira/provider";
import { isPlaceholderName, useProfiles } from "./profiles";
import { useSettings, type ContentFilters } from "./settings";
import { useTogether } from "./together/provider";

function sameHideContent(a: ContentFilters, b: ContentFilters): boolean {
  return (
    a.anime === b.anime &&
    a.liveTv === b.liveTv &&
    a.sports === b.sports &&
    a.adult === b.adult
  );
}

export function ProfileIdentitySync() {
  const { activeProfile, updateProfile } = useProfiles();
  const { settings, update } = useSettings();
  const { displayName, setDisplayName } = useTogether();
  const { me } = useCira();

  // Keep the local primary profile id intact (so LUMA storage keys stay stable),
  // and hydrate its name from the unified CIRA account profile when still placeholder.
  useEffect(() => {
    if (!activeProfile || activeProfile.kid || !activeProfile.isPrimary) return;
    if (!me?.displayName) return;
    if (isPlaceholderName(activeProfile.name) && activeProfile.name !== me.displayName) {
      updateProfile(activeProfile.id, { name: me.displayName });
    }
  }, [activeProfile, me?.displayName, updateProfile]);

  useEffect(() => {
    if (!activeProfile || activeProfile.kid) return;
    if (settings.harborColor !== activeProfile.color) {
      update({ harborColor: activeProfile.color });
    }
  }, [activeProfile, settings.harborColor, update]);

  useEffect(() => {
    if (!activeProfile || activeProfile.kid) return;
    if (settings.harborAvatar !== activeProfile.avatar) {
      update({ harborAvatar: activeProfile.avatar });
    }
  }, [activeProfile, settings.harborAvatar, update]);

  useEffect(() => {
    if (!activeProfile || activeProfile.kid) return;
    if (activeProfile.name && displayName !== activeProfile.name) {
      setDisplayName(activeProfile.name);
    }
  }, [activeProfile, displayName, setDisplayName]);

  useEffect(() => {
    if (!activeProfile?.hideContent) return;
    if (!sameHideContent(settings.hideContent, activeProfile.hideContent)) {
      update({ hideContent: activeProfile.hideContent });
    }
  }, [activeProfile, settings.hideContent, update]);

  return null;
}
