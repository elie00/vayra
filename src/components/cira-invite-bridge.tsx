import { useEffect } from "react";
import { useCira } from "@/lib/cira/provider";
import { onCiraGroupInvite, onCiraInvite } from "@/lib/deep-link";
import { useView } from "@/lib/view";

// Relie le deep link vayra://cira/invite#t=<code> à l'UI : mémorise le code
// dans le provider CIRA puis ouvre Réglages -> CIRA où la décision se prend.
export function CiraInviteBridge() {
  const { presentInvite, presentGroupInvite } = useCira();
  const { openSettings } = useView();
  useEffect(() => {
    const unsubscribeRelation = onCiraInvite((code) => {
        presentInvite(code);
        openSettings("cira");
      });
    const unsubscribeGroup = onCiraGroupInvite((code) => {
      presentGroupInvite(code);
      openSettings("cira");
    });
    return () => {
      unsubscribeRelation();
      unsubscribeGroup();
    };
  }, [presentInvite, presentGroupInvite, openSettings]);
  return null;
}
