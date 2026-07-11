import { useEffect } from "react";
import { useProfiles } from "./profiles";
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
  const { activeProfile } = useProfiles();
  const { settings, update } = useSettings();
  const { displayName, setDisplayName } = useTogether();

  useEffect(() => {
    if (!activeProfile) return;
    if (settings.harborColor !== activeProfile.color) {
      update({ harborColor: activeProfile.color });
    }
  }, [activeProfile, settings.harborColor, update]);

  useEffect(() => {
    if (!activeProfile) return;
    if (settings.harborAvatar !== activeProfile.avatar) {
      update({ harborAvatar: activeProfile.avatar });
    }
  }, [activeProfile, settings.harborAvatar, update]);

  useEffect(() => {
    if (!activeProfile) return;
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
