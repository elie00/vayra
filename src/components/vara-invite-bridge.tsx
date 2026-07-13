import { useEffect } from "react";
import { onVaraInvite } from "@/lib/deep-link";
import { useVara } from "@/lib/vara/provider";
import { useView } from "@/lib/view";

export function VaraInviteBridge() {
  const { presentLink } = useVara();
  const { openSettings } = useView();
  useEffect(() => onVaraInvite((code) => {
    presentLink(code);
    openSettings("cira");
  }), [presentLink, openSettings]);
  return null;
}
